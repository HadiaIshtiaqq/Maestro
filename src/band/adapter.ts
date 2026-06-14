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

export class BandSdkAdapter extends MockBandAdapter {
  private apiUrl    = (process.env.BAND_API_URL ?? "https://app.band.ai/api/v1/agent").replace(/\/$/, "");
  private apiKey    = process.env.BAND_API_KEY ?? "";
  private mentionId = process.env.BAND_MENTION_ID ?? "";   // another participant's UUID
  // Maestro room_id (uuid) → Band chat id
  private chatIds = new Map<string, string>();

  private async api(method: string, path: string, body?: any): Promise<any> {
    if (!this.apiKey) throw new Error("BAND_API_KEY not configured");
    const res = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: { "X-API-Key": this.apiKey, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error(`Band API ${method} ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.status === 204 ? null : res.json();
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
        // Add the mention target (and optional human commander) as participants,
        // otherwise Band rejects messages with "mentioned_participant_not_in_room".
        for (const pid of [this.mentionId, process.env.BAND_HUMAN_ID].filter(Boolean)) {
          await this.api("POST", `/chats/${chatId}/participants`, {
            participant: { participant_id: pid },
          }).catch(e => console.warn(`[Band] add participant ${pid} failed: ${e.message}`));
        }
        console.log(`[Band] Opened real Band chat ${chatId} for incident ${incidentId.slice(0, 8)}`);
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
    if (chatId && this.mentionId) {
      // Awaited so failures surface and post ordering is preserved.
      try {
        await this.api("POST", `/chats/${chatId}/messages`, {
          message: {
            content:  this.renderContent(message),
            mentions: [{ id: this.mentionId }],   // must be another participant
          },
        });
        console.log(`[Band] → posted ${message.msg_type} from ${message.from_agent} to chat ${chatId.slice(0, 8)}`);
      } catch (e: any) {
        console.warn(`[Band] post remote failed for chat ${chatId.slice(0, 8)}: ${e.message}`);
      }
    } else if (chatId && !this.mentionId) {
      console.warn("[Band] BAND_MENTION_ID not set — skipping remote post (Band requires mentioning another participant)");
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
