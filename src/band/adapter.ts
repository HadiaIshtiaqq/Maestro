import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import {
  BandMessage, BandRoom, IBandAdapter,
  MsgType, AUTHORITY_RULES,
} from "./types";

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

    const msg: BandMessage = {
      ...message,
      id:      uuidv4(),
      room_id: roomId,
      ts:      new Date().toISOString(),
    };

    // Store in memory
    this.messages.get(roomId)!.push(msg);

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
// Skeleton for the real Band platform integration. It keeps the Mock's local
// room/message bookkeeping (so the operator UI and audit mirror keep working)
// and additionally pushes every operation to the Band API.
//
// To activate: set BAND_API_URL + BAND_API_KEY (from kickoff onboarding) and
// BAND_USE_SDK=true. Endpoint paths below follow the Band Agent API docs and
// must be confirmed against the real API reference once credentials arrive.

export class BandSdkAdapter extends MockBandAdapter {
  private apiUrl = process.env.BAND_API_URL ?? "";
  private apiKey = process.env.BAND_API_KEY ?? "";

  private async api(path: string, body: any): Promise<any> {
    if (!this.apiUrl || !this.apiKey) {
      throw new Error("BAND_API_URL / BAND_API_KEY not configured");
    }
    const res = await fetch(`${this.apiUrl}${path}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Band API ${path} → ${res.status}: ${await res.text()}`);
    return res.json();
  }

  override async createRoom(incidentId: string): Promise<BandRoom> {
    const room = await super.createRoom(incidentId);
    await this.api("/rooms", { external_id: incidentId, name: `incident-${incidentId}` });
    return room;
  }

  override async joinRoom(roomId: string, agentId: string): Promise<void> {
    await super.joinRoom(roomId, agentId);
    await this.api(`/rooms/${roomId}/join`, { agent_id: agentId });
  }

  override async post(
    roomId: string,
    message: Omit<BandMessage, "id" | "room_id" | "ts">
  ): Promise<BandMessage> {
    const msg = await super.post(roomId, message);
    await this.api(`/rooms/${roomId}/messages`, msg);
    return msg;
  }

  override async recruit(roomId: string, agentRole: string): Promise<void> {
    await super.recruit(roomId, agentRole);
    await this.api(`/rooms/${roomId}/recruit`, { agent_role: agentRole });
  }

  override async closeRoom(roomId: string): Promise<void> {
    await super.closeRoom(roomId);
    await this.api(`/rooms/${roomId}/close`, {});
  }
}

// Singleton — all agents share one adapter instance per process.
// BAND_USE_SDK=true switches to the real platform adapter (post-kickoff).
export const bandAdapter: MockBandAdapter =
  process.env.BAND_USE_SDK === "true" ? new BandSdkAdapter() : new MockBandAdapter();
