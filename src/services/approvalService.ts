import { v4 as uuidv4 } from "uuid";
import { Approval, AgentMessage, Incident } from "../models/index";
import { bandAdapter }    from "../band/adapter";
import { eventBus }       from "../events/eventBus";

// ─── Pending Approvals (in-memory gate) ──────────────────────────────────────
// Each pending approval is a Promise that resolves (approved) or rejects (vetoed).
// The incident pipeline awaits this promise before proceeding past the gate.

interface PendingApproval {
  proposalMsgId: string;
  roomId:        string;
  incidentId:    string;
  resolve:       (decision: 'approved' | 'vetoed') => void;
  reject:        (reason: any) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingApproval>();

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — then auto-veto for safety

// ─── createApprovalGate ───────────────────────────────────────────────────────
// Called by the incident pipeline when commander posts an approval_request.
// Returns a Promise<'approved' | 'vetoed'>.

export function createApprovalGate(
  proposalMsgId: string,
  roomId:        string,
  incidentId:    string
): Promise<'approved' | 'vetoed'> {
  return new Promise<'approved' | 'vetoed'>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      pending.delete(proposalMsgId);
      console.warn(`[Approval] Gate ${proposalMsgId} timed out — action vetoed by timeout`);
      resolve('vetoed');
    }, APPROVAL_TIMEOUT_MS);

    pending.set(proposalMsgId, {
      proposalMsgId,
      roomId,
      incidentId,
      resolve,
      reject,
      timeoutHandle,
    });

    // Broadcast to UI so the operator sees the approval request
    eventBus.emit('approval:pending', { proposalMsgId, roomId, incidentId });
  });
}

// ─── submitDecision ───────────────────────────────────────────────────────────
// Called by POST /api/band/approve or POST /api/band/veto.
// approverId is validated upstream (only human-commander role allowed).

export async function submitDecision(
  proposalMsgId: string,
  decision:      'approved' | 'vetoed',
  approverId:    string,
  notes?:        string
): Promise<{ ok: boolean; error?: string }> {
  const gate = pending.get(proposalMsgId);
  if (!gate) {
    // May already be resolved (duplicate click) — check DB if connected
    const mongoose = (await import('mongoose')).default;
    if (mongoose.connection.readyState === 1) {
      const exists = await Approval.findOne({ proposal_id: proposalMsgId });
      if (exists) return { ok: false, error: 'Already decided' };
    }
    return { ok: false, error: 'No pending approval for that proposal ID' };
  }

  clearTimeout(gate.timeoutHandle);
  pending.delete(proposalMsgId);

  // Persist to DB (audit trail)
  const approvalId = uuidv4();
  await Approval.create({
    approval_id:  approvalId,
    room_id:      gate.roomId,
    incident_id:  gate.incidentId,
    proposal_id:  proposalMsgId,
    approver_id:  approverId,
    decision,
    notes:        notes ?? '',
    ts:           new Date(),
  });

  // Post to Band room as human-commander message
  await bandAdapter.post(gate.roomId, {
    msg_type:                'approval',
    from_agent:              'human-commander',
    incident_id:             gate.incidentId,
    step:                    'human_approval',
    payload:                 { decision, approver_id: approverId, notes, approval_id: approvalId },
    confidence:              1.0,
    requires_human_approval: false,
  });

  // Update incident record
  if (decision === 'approved') {
    await Incident.findOneAndUpdate(
      { incidentId: gate.incidentId },
      { $set: { approvedBy: approverId, approvedAt: new Date(), pendingApprovalId: null } }
    );
  }

  eventBus.emit('approval:decided', { proposalMsgId, decision, approverId, incidentId: gate.incidentId });

  // Resolve the gate promise so the pipeline can continue
  gate.resolve(decision);

  return { ok: true };
}

// ─── getPendingApprovals ──────────────────────────────────────────────────────

export function getPendingApprovals(): Array<{
  proposalMsgId: string;
  roomId:        string;
  incidentId:    string;
}> {
  return [...pending.values()].map(({ proposalMsgId, roomId, incidentId }) => ({
    proposalMsgId, roomId, incidentId,
  }));
}

export function isPending(proposalMsgId: string): boolean {
  return pending.has(proposalMsgId);
}
