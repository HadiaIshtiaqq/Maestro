import { BandMessage, IBandAdapter, MsgType } from "../band/types";
import type { AgentTask } from "./AntigravityCore";

// ─── NexusAgent base ──────────────────────────────────────────────────────────
// Every NEXUS agent extends this. The Band connection is identical for all;
// only think() and shouldAct() are role-specific.
//
// In the real Band SDK: constructor receives AgentConfig(agent_id, api_key)
// from config/agents.yaml and calls new Agent(config). This file is the
// isolation layer — swap the IBandAdapter impl without touching agent logic.

export abstract class NexusAgent {
  constructor(
    protected role:    string,
    protected agentId: string,
    protected band:    IBandAdapter
  ) {}

  abstract think(msg: BandMessage, context: any): Promise<any>;
  abstract shouldAct(msg: BandMessage): boolean;

  protected envelope(
    result:    any,
    msgType:   MsgType,
    incidentId: string,
    _roomId:   string,
    step?:     string
  ): Omit<BandMessage, 'id' | 'room_id' | 'ts'> {
    return {
      msg_type:                msgType,
      from_agent:              this.role,
      incident_id:             incidentId,
      step:                    step ?? this.role,
      payload:                 result,
      confidence:              result?.confidence ?? 0.5,
      requires_human_approval: result?.requires_human_approval ?? false,
      engine:                  result?.engine,
    };
  }

  async run(roomId: string, msg: BandMessage, context: any): Promise<BandMessage | null> {
    if (!this.shouldAct(msg)) return null;
    const result = await this.think(msg, context);
    if (!result) return null;
    const msgType: MsgType = this.role === 'incident-commander'
      ? (result.requires_human_approval ? 'approval_request' : 'proposal')
      : 'finding';
    return this.band.post(roomId, this.envelope(result, msgType, msg.incident_id, roomId));
  }
}

// ─── CommanderTriageAgent ─────────────────────────────────────────────────────
// Concrete NexusAgent. Runs between Phase 1 (intel) and Phase 2 (response).
// Evaluates SEV and posts a status message listing the agents being recruited.
// Demonstrates the NexusAgent base-class pattern with Band-native message flow.

const PHASE_2_ALL   = ['responder-allocation', 'dependency-impact-sim', 'mitigation-projection', 'runbook-advisor'];
const PHASE_2_LIGHT = ['responder-allocation', 'runbook-advisor'];

export class CommanderTriageAgent extends NexusAgent {
  constructor(band: IBandAdapter) {
    super('incident-commander', 'nexus-commander-triage', band);
  }

  shouldAct(msg: BandMessage): boolean {
    return msg.from_agent === 'severity-blast-radius' && msg.msg_type === 'finding';
  }

  async think(_msg: BandMessage, context: any): Promise<any> {
    const sevLevel: string = context?.['severity-blast-radius']?.sevLevel ?? 'SEV-3';
    const agentsRecruited = (sevLevel === 'SEV-4' || sevLevel === 'SEV-5')
      ? PHASE_2_LIGHT
      : PHASE_2_ALL;
    return {
      sevLevel,
      agentsRecruited,
      message: `SEV assessed as ${sevLevel}. Recruiting Phase-2 response team: [${agentsRecruited.join(', ')}]`,
      confidence: 0.92,
      requires_human_approval: false,
      engine: 'policy (severity-based)',
    };
  }
}

// Helper to build a synthetic BandMessage from a task result for triage activation
export function buildTriggerMsg(incidentId: string, roomId: string, task: AgentTask): BandMessage {
  const sevOutput = task.context?.['severity-blast-radius'] ?? {};
  return {
    id:                      'triage-trigger',
    room_id:                 roomId,
    incident_id:             incidentId,
    msg_type:                'finding',
    from_agent:              'severity-blast-radius',
    step:                    'severity-blast-radius',
    payload:                 sevOutput,
    confidence:              0.8,
    requires_human_approval: false,
    ts:                      new Date().toISOString(),
  };
}
