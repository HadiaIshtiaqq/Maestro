import { EventEmitter } from "events";
import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import {
  BandMessage, BandRoom, IBandAdapter,
  MsgType, AUTHORITY_RULES,
} from "./types";

// Tamper-evident hash chain: each message's hash binds its content to the
// previous message's hash, so any after-the-fact edit/insert/delete breaks the
// chain. Genesis (first message in a room) chains from "GENESIS".
export function hashMessage(msg: BandMessage, prevHash: string): string {
  const canonical = JSON.stringify({
    msg_type: msg.msg_type, from_agent: msg.from_agent, incident_id: msg.incident_id,
    room_id: msg.room_id, step: msg.step, payload: msg.payload,
    confidence: msg.confidence, requires_human_approval: msg.requires_human_approval,
    engine: msg.engine ?? null, ts: msg.ts, prev_hash: prevHash,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// Parse a human's free-text Band reply into an approval decision. This is how
// the coordination loop closes THROUGH Band: the human types a reply in the
// Band chat, Maestro reads it back and releases the gate on it.
export function parseDecision(text: string): 'approved' | 'vetoed' | null {
  const t = (text || "").toLowerCase();
  if (/\b(veto|reject|rejected|deny|denied|decline|declined|abort|stop|do ?not|don'?t)\b/.test(t)) return 'vetoed';
  if (/\b(approve|approved|approval|lgtm|proceed|go ahead|authori[sz]e[d]?|confirm(ed)?|ok|yes)\b/.test(t)) return 'approved';
  return null;
}

// Verify a room's audit chain. Returns the first break, or null if intact.
export function verifyChain(messages: BandMessage[]): { ok: boolean; brokenAt?: number } {
  let prev = "GENESIS";
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.prev_hash !== prev) return { ok: false, brokenAt: i };
    if (m.hash !== hashMessage(m, prev)) return { ok: false, brokenAt: i };
    prev = m.hash;
  }
  return { ok: true };
}

// ─── Mock Band Adapter ────────────────────────────────────────────────────────
// Simulates the Band SDK until real credentials arrive at kickoff.
// The real SDK wraps the same IBandAdapter interface — only this file changes.
//
// Behaviour implemented:
//   • One in-memory room store + message log per incident
//   • Authority enforcement (AUTHORITY_RULES, §2.4 TRD)
//   • EventEmitter-based delivery to registered listeners
//   • MongoDB mirror via AgentMessageModel (set after server boot)
//   • Socket.IO broadcast hook (set after server boot)

export class MockBandAdapter extends EventEmitter implements IBandAdapter {
  private rooms        = new Map<string, BandRoom>();
  private messages     = new Map<string, BandMessage[]>();  // room_id → messages
  private roomListeners = new Map<string, Set<(m: BandMessage) => void>>();

  // Injected after server boot to avoid circular imports
  private dbMirror: ((msg: BandMessage) => Promise<void>) | null = null;
  private broadcast: ((event: string, data: any) => void) | null = null;

  setDbMirror(fn: (msg: BandMessage) => Promise<void>) { this.dbMirror = fn; }
  setBroadcast(fn: (event: string, data: any) => void)  { this.broadcast = fn; }

  // ── createRoom ──────────────────────────────────────────────────────────────
  async createRoom(incidentId: string): Promise<BandRoom> {
    const room: BandRoom = {
      room_id:    uuidv4(),
      incident_id: incidentId,
      participants: [],
      created_at: new Date().toISOString(),
      status:     'open',
    };
    this.rooms.set(room.room_id, room);
    this.messages.set(room.room_id, []);
    this.broadcast?.('band:room_created', room);
    return room;
  }

  // ── joinRoom ────────────────────────────────────────────────────────────────
  async joinRoom(roomId: string, agentId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Band room ${roomId} not found`);
    if (!room.participants.includes(agentId)) {
      room.participants.push(agentId);
      this.broadcast?.('band:agent_joined', { room_id: roomId, agent_id: agentId });
    }
  }

  // ── post ────────────────────────────────────────────────────────────────────
  async post(
    roomId: string,
    message: Omit<BandMessage, 'id' | 'room_id' | 'ts'>
  ): Promise<BandMessage> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Band room ${roomId} not found`);

    // Authority enforcement (Band control plane, §2.4 TRD)
    const allowed = AUTHORITY_RULES[message.msg_type as MsgType];
    if (allowed && !allowed.includes(message.from_agent)) {
      throw new Error(
        `Authority violation: ${message.from_agent} cannot post msg_type="${message.msg_type}"`
      );
    }

    const log = this.messages.get(roomId)!;
    const prevHash = log.length ? (log[log.length - 1].hash ?? "GENESIS") : "GENESIS";

    const msg: BandMessage = {
      ...message,
      id:      uuidv4(),
      room_id: roomId,
      ts:      new Date().toISOString(),
      prev_hash: prevHash,
    };
    msg.hash = hashMessage(msg, prevHash);

    // Store in memory
    log.push(msg);

    // Mirror to MongoDB — awaited so the audit record is durable before the
    // message is considered posted. A mirror failure is logged loudly but does
    // not block delivery (the in-memory room must keep working in the demo).
    if (this.dbMirror) {
      try {
        await this.dbMirror(msg);
      } catch (e: any) {
        console.error(`[Band] AUDIT MIRROR FAILED for msg ${msg.id} (${msg.msg_type} from ${msg.from_agent}):`, e.message);
      }
    }

    // Notify room listeners
    const handlers = this.roomListeners.get(roomId);
    if (handlers) {
      for (const handler of handlers) {
        try { handler(msg); } catch { /* listener error isolation */ }
      }
    }

    // Broadcast to Socket.IO for operator view
    this.broadcast?.('band:message', msg);

    return msg;
  }

  // ── getMessages ─────────────────────────────────────────────────────────────
  async getMessages(roomId: string): Promise<BandMessage[]> {
    return this.messages.get(roomId) ?? [];
  }

  // ── getRoom ─────────────────────────────────────────────────────────────────
  async getRoom(roomId: string): Promise<BandRoom | null> {
    return this.rooms.get(roomId) ?? null;
  }

  // ── getRooms ────────────────────────────────────────────────────────────────
  async getRooms(): Promise<BandRoom[]> {
    return [...this.rooms.values()];
  }

  // ── recruit ─────────────────────────────────────────────────────────────────
  // Commander calls this to dynamically pull additional agents into the room.
  async recruit(roomId: string, agentRole: string): Promise<void> {
    await this.joinRoom(roomId, agentRole);
    this.broadcast?.('band:agent_recruited', { room_id: roomId, agent_role: agentRole });
    console.log(`[Band] Recruited ${agentRole} into room ${roomId}`);
  }

  // ── onMessage ────────────────────────────────────────────────────────────────
  onMessage(roomId: string, handler: (msg: BandMessage) => void): () => void {
    if (!this.roomListeners.has(roomId)) {
      this.roomListeners.set(roomId, new Set());
    }
    this.roomListeners.get(roomId)!.add(handler);
    return () => this.roomListeners.get(roomId)?.delete(handler);
  }

  // Wipe the in-memory room/message store (used by the demo-reset endpoint so a
  // recording starts from an empty board without a server restart).
  clearLocal(): void {
    this.rooms.clear();
    this.messages.clear();
    this.roomListeners.clear();
  }

  // ── hydrateFromDb ───────────────────────────────────────────────────────────
  // Restores rooms + message logs persisted in MongoDB into the in-memory store
  // so Band rooms survive a server restart. Called once at boot (server.ts).
  hydrate(rooms: BandRoom[], messages: BandMessage[]): void {
    for (const room of rooms) {
      if (!this.rooms.has(room.room_id)) {
        this.rooms.set(room.room_id, room);
        this.messages.set(room.room_id, []);
      }
    }
    for (const msg of messages) {
      const log = this.messages.get(msg.room_id);
      if (log && !log.some(m => m.id === msg.id)) log.push(msg);
    }
    for (const log of this.messages.values()) {
      log.sort((a, b) => a.ts.localeCompare(b.ts));
    }
    console.log(`[Band] Hydrated ${rooms.length} room(s), ${messages.length} message(s) from MongoDB`);
  }

  // ── closeRoom ────────────────────────────────────────────────────────────────
  async closeRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room) {
      room.status = 'closed';
      this.broadcast?.('band:room_closed', { room_id: roomId });
    }
  }
}

// ─── Band SDK Adapter (real platform) ────────────────────────────────────────
// Real Band Agent API integration, verified live against the actual API:
//   Base URL : https://app.band.ai/api/v1/agent        (BAND_API_URL override)
//   Auth     : X-API-Key: <agent api key>              (BAND_API_KEY)
//   Create   : POST /chats   { chat: { title } }   -> { data: { id, ... } }
//   Post msg : POST /chats/{id}/messages { message: { content, mentions:[{id}] } }
//   List msg : GET  /chats/{id}/messages -> { data: [...], metadata }
//
// Live API facts this adapter encodes (each cost a failed call to discover):
//   • The create/response envelope is wrapped in `data` — chat id is data.id.
//   • `task_id` must reference an EXISTING Band task; we omit it (was rejected
//     with "does not exist" when passed an arbitrary incident UUID).
//   • Every message must @mention another PARTICIPANT by `id` (UUID). A handle
//     is not accepted, and an agent CANNOT mention itself ("cannot_mention_self").
//     So BAND_MENTION_ID must be another participant in the chat (a second
//     Maestro agent or a human). Without it, remote posting is skipped (the
//     local governed/audited room keeps working regardless).
//
// Band's text+mention model carries Maestro's structured BandMessage envelopes
// in the message content (human-readable header + compact JSON). The local Mock
// store stays the source of truth for authority enforcement, the hash-chained
// audit trail, and the operator UI; Band is the live coordination backbone.
//
// Activate: BAND_USE_SDK=true + BAND_API_KEY + BAND_MENTION_ID.

// A Band agent identity (one registered external agent: its API key + UUID).
interface BandIdentity { key: string; id: string; name: string; }

// Which Maestro agent roles post under which Band identity slot. This is what
// makes DISTINCT agents appear collaborating in the Band chat: workers post as
// the "intel"/"response" agents, the commander posts as the "commander" agent,
// and they @mention each other / the human.
const ROLE_SLOT: Record<string, "commander" | "intel" | "response"> = {
  "incident-commander":     "commander",
  "human-commander":        "commander",
  "intake-normalization":   "intel",
  "correlation-dedup":      "intel",
  "validation-credibility": "intel",
  "classification":         "intel",
  "severity-blast-radius":  "intel",
  "responder-allocation":   "response",
  "dependency-impact-sim":  "response",
  "mitigation-projection":  "response",
  "runbook-advisor":        "response",
  "stakeholder-comms":      "response",
};

export class BandSdkAdapter extends MockBandAdapter {
  private apiUrl = (process.env.BAND_API_URL ?? "https://app.band.ai/api/v1/agent").replace(/\/$/, "");

  // Band agent identities by slot. Commander is the primary (BAND_API_KEY).
  // intel/response fall back to commander when their own keys aren't set, so
  // the adapter works with 1, 2, or 3 registered agents.
  // NB: use || not ?? — empty-string env vars (FOO=) must fall through.
  private commander: BandIdentity = {
    key:  process.env.BAND_API_KEY || "",
    id:   process.env.BAND_API_AGENT_ID || "",
    name: "Maestro Commander",
  };
  private intel: BandIdentity = {
    key:  process.env.BAND_INTEL_KEY || process.env.BAND_API_KEY || "",
    id:   process.env.BAND_INTEL_ID  || process.env.BAND_MENTION_ID || "",
    name: "Maestro Intel",
  };
  private response: BandIdentity = {
    key:  process.env.BAND_RESPONSE_KEY || process.env.BAND_INTEL_KEY || process.env.BAND_API_KEY || "",
    id:   process.env.BAND_RESPONSE_ID  || process.env.BAND_INTEL_ID  || process.env.BAND_MENTION_ID || "",
    name: "Maestro Response",
  };
  private humanId   = process.env.BAND_HUMAN_ID || "";
  private mentionId = process.env.BAND_MENTION_ID || "";   // legacy single-peer fallback
  // Maestro room_id (uuid) → Band chat id
  private chatIds = new Map<string, string>();

  // All distinct, configured participant UUIDs to add to every chat.
  private participantIds(): string[] {
    return [...new Set(
      [this.commander.id, this.intel.id, this.response.id, this.humanId, this.mentionId].filter(Boolean)
    )];
  }

  private identityFor(fromAgent: string): BandIdentity {
    const slot = ROLE_SLOT[fromAgent] ?? "intel";
    const id = slot === "commander" ? this.commander : slot === "response" ? this.response : this.intel;
    // Fall back to commander if this slot has no usable key.
    return id.key ? id : this.commander;
  }

  // Pick a mention target that is NOT the poster (Band rejects self-mentions).
  // Decision messages ping the human; findings are directed at the commander.
  private mentionTarget(msgType: string, posterId: string): string {
    if ((msgType === "approval_request" || msgType === "proposal") && this.humanId && this.humanId !== posterId) {
      return this.humanId;
    }
    const candidates = [this.commander.id, this.humanId, this.intel.id, this.mentionId];
    return candidates.find(c => c && c !== posterId) ?? "";
  }

  private async apiAs(key: string, method: string, path: string, body?: any): Promise<any> {
    if (!key) throw new Error("Band agent key not configured");
    const res = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: { "X-API-Key": key, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error(`Band API ${method} ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.status === 204 ? null : res.json();
  }

  // Default API call uses the commander identity (chat creation, decision reads).
  private async api(method: string, path: string, body?: any): Promise<any> {
    return this.apiAs(this.commander.key, method, path, body);
  }

  // Is this adapter wired to the real Band platform?
  isLive(): boolean { return !!this.commander.key; }

  // Read the human's decision back FROM Band — closes the coordination loop
  // through the platform. Returns a decision once the human replies in the chat.
  async getRemoteDecision(
    roomId: string,
    afterIso: string
  ): Promise<{ decision: "approved" | "vetoed"; notes: string; by: string } | null> {
    const chatId = this.chatIds.get(roomId);
    if (!chatId) return null;
    let resp: any;
    try {
      resp = await this.api("GET", `/chats/${chatId}/messages`);
    } catch {
      return null;
    }
    const msgs: any[] = resp?.data ?? [];
    const after = new Date(afterIso).getTime();
    // By default only the human commander can release the gate. Optionally a
    // peer reviewer agent may too (pure agent-to-agent mode for demos).
    const allowAgent = process.env.BAND_ALLOW_AGENT_APPROVAL === "true";
    // Oldest-first so the first decision wins.
    const ordered = [...msgs].sort(
      (a, b) => new Date(a.inserted_at).getTime() - new Date(b.inserted_at).getTime()
    );
    for (const m of ordered) {
      const authorized = m.sender_type === "User" || (allowAgent && m.sender_type === "Agent");
      if (!authorized) continue;
      if (new Date(m.inserted_at).getTime() <= after) continue; // only replies after the request
      const decision = parseDecision(m.content ?? "");
      if (decision) {
        return { decision, notes: (m.content ?? "").slice(0, 200), by: m.sender_name ?? "human" };
      }
    }
    return null;
  }

  // Render a structured Maestro envelope into a readable Band message body.
  private renderContent(message: Omit<BandMessage, "id" | "room_id" | "ts">): string {
    const tag = message.msg_type.toUpperCase();
    const eng = message.engine ? ` · ${message.engine}` : "";
    const head = `[${tag}] ${message.from_agent}${eng}`;
    const summary =
      message.payload?.message ??
      message.payload?.commanderSummary ??
      message.payload?.recommendedAction?.action ??
      `${message.step} finding`;
    // Compact structured payload appended so nothing is lost on the Band side.
    return `${head}\n${summary}\n\n\`\`\`json\n${JSON.stringify(message.payload ?? {}, null, 0).slice(0, 3500)}\n\`\`\``;
  }

  override async createRoom(incidentId: string): Promise<BandRoom> {
    const room = await super.createRoom(incidentId);
    try {
      // task_id intentionally omitted — Band requires it to reference a real task.
      const resp = await this.api("POST", "/chats", {
        chat: { title: `Maestro incident ${incidentId.slice(0, 8)}` },
      });
      const chatId = resp?.data?.id ?? resp?.id;
      if (chatId) {
        this.chatIds.set(room.room_id, chatId);
        // Add every distinct agent identity + the human as participants, else
        // Band rejects messages with "mentioned_participant_not_in_room". The
        // chat creator (commander) is added automatically by Band.
        for (const pid of this.participantIds()) {
          if (pid === this.commander.id) continue;
          await this.api("POST", `/chats/${chatId}/participants`, {
            participant: { participant_id: pid },
          }).catch(e => console.warn(`[Band] add participant ${pid} failed: ${e.message}`));
        }
        const distinct = new Set([this.commander.key, this.intel.key, this.response.key].filter(Boolean)).size;
        console.log(`[Band] Opened real Band chat ${chatId} for incident ${incidentId.slice(0, 8)} (${distinct} agent identit${distinct === 1 ? "y" : "ies"})`);
      }
    } catch (e: any) {
      console.warn(`[Band] createRoom remote failed (local room still active): ${e.message}`);
    }
    return room;
  }

  override async post(
    roomId: string,
    message: Omit<BandMessage, "id" | "room_id" | "ts">
  ): Promise<BandMessage> {
    // Local store first — preserves authority enforcement, audit mirror, UI.
    const msg = await super.post(roomId, message);
    const chatId = this.chatIds.get(roomId);
    if (!chatId) return msg;

    // Post under the Band identity for this role, so distinct agents appear
    // collaborating in the chat (worker findings vs commander proposals).
    const poster  = this.identityFor(message.from_agent);
    const mention = this.mentionTarget(message.msg_type, poster.id);
    if (poster.key && mention) {
      try {
        let content = this.renderContent(message);
        if (message.msg_type === "approval_request") {
          content += `\n\n⛔ HUMAN COMMANDER: reply in this chat with "approve" or "veto" to release the gate.`;
        }
        await this.apiAs(poster.key, "POST", `/chats/${chatId}/messages`, {
          message: { content, mentions: [{ id: mention }] },
        });
        console.log(`[Band] → ${message.from_agent} (as ${poster.name}) posted ${message.msg_type} to chat ${chatId.slice(0, 8)}`);
      } catch (e: any) {
        console.warn(`[Band] post remote failed for chat ${chatId.slice(0, 8)}: ${e.message}`);
      }
    } else if (!mention) {
      console.warn("[Band] No mention target available — skipping remote post (Band requires mentioning another participant)");
    }
    return msg;
  }

  override async closeRoom(roomId: string): Promise<void> {
    await super.closeRoom(roomId);
    this.chatIds.delete(roomId);
  }
}

// Singleton — all agents share one adapter instance per process.
// BAND_USE_SDK=true switches to the real Band platform adapter.
export const bandAdapter: MockBandAdapter =
  process.env.BAND_USE_SDK === "true" ? new BandSdkAdapter() : new MockBandAdapter();
