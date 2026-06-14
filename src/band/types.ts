// ─── Band SDK Types ───────────────────────────────────────────────────────────
// These mirror the Band SDK contracts. The real method signatures will be
// confirmed at kickoff; this adapter isolates them from agent logic.

export type MsgType =
  | 'finding'           // worker agents post analysis results
  | 'proposal'          // commander-only: proposed high-stakes action
  | 'approval_request'  // commander-only: requests human sign-off
  | 'approval'          // human-commander-only: approves a proposal
  | 'retraction'        // commander or human: reverses a prior action
  | 'status';           // any agent: lifecycle updates (room opened, contained, etc.)

export interface BandMessage {
  id: string;
  msg_type: MsgType;
  from_agent: string;
  incident_id: string;
  room_id: string;
  step: string;
  payload: any;
  confidence: number;
  requires_human_approval: boolean;
  engine?: string;   // which LLM framework produced this message (cross-framework visibility)
  ts: string;
  prev_hash?: string;  // hash of the previous message in this room (tamper-evident chain)
  hash?: string;       // SHA-256 of this message's content + prev_hash
}

export interface BandRoom {
  room_id: string;
  incident_id: string;
  participants: string[];
  created_at: string;
  status: 'open' | 'closed';
}

// ─── Authority policy ─────────────────────────────────────────────────────────
// Separation-of-duties enforced by Band's control plane (§2.4 TRD).
// In the mock this is validated inside post().

export const AUTHORITY_RULES: Record<MsgType, string[] | null> = {
  finding:          null,             // any agent
  status:           null,             // any agent
  proposal:         ['incident-commander'],
  approval_request: ['incident-commander'],
  approval:         ['human-commander'],
  retraction:       ['incident-commander', 'human-commander'],
};

// ─── IBandAdapter interface ───────────────────────────────────────────────────
// Swap real band-sdk in here once kickoff credentials arrive.

export interface IBandAdapter {
  createRoom(incidentId: string): Promise<BandRoom>;
  joinRoom(roomId: string, agentId: string): Promise<void>;
  post(
    roomId: string,
    message: Omit<BandMessage, 'id' | 'room_id' | 'ts'>
  ): Promise<BandMessage>;
  getMessages(roomId: string): Promise<BandMessage[]>;
  getRoom(roomId: string): Promise<BandRoom | null>;
  getRooms(): Promise<BandRoom[]>;
  recruit(roomId: string, agentRole: string): Promise<void>;
  onMessage(roomId: string, handler: (msg: BandMessage) => void): () => void;
  closeRoom(roomId: string): Promise<void>;
}
