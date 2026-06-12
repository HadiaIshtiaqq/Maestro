import { Incident, Signal, ISignal, BandRoom as BandRoomModel, AgentMessage } from "../models/index";
import { nexusOrchestrator } from "../agents/ciroAgents";
import { resourceManager }   from "./resourceManager";
import { eventBus }          from "../events/eventBus";
import { notifyUsersNearIncident } from "./alertService";
import { bandAdapter }        from "../band/adapter";
import { createApprovalGate } from "./approvalService";
import { BandMessage }        from "../band/types";
import { AgentTask, AgentResult } from "../agents/AntigravityCore";
import { CommanderTriageAgent, buildTriggerMsg } from "../agents/base";
import { v4 as uuidv4 }       from "uuid";

// ─── Wire Band adapter → MongoDB mirror ───────────────────────────────────────

bandAdapter.setDbMirror(async (msg: BandMessage) => {
  if (AgentMessage) {
    await AgentMessage.create({
      id:                      msg.id,
      room_id:                 msg.room_id,
      incident_id:             msg.incident_id,
      msg_type:                msg.msg_type,
      from_agent:              msg.from_agent,
      step:                    msg.step,
      payload:                 msg.payload,
      confidence:              msg.confidence,
      requires_human_approval: msg.requires_human_approval,
      engine:                  msg.engine,
      ts:                      new Date(msg.ts),
    }).catch(() => {/* ignore duplicate key errors */});
  }
});

// ─── Pipeline phase definitions ───────────────────────────────────────────────

// Phase 1: Core intelligence — always runs, posts findings in real-time
const PHASE_1 = [
  "intake-normalization",
  "correlation-dedup",
  "validation-credibility",   // Claude cross-framework agent
  "classification",
  "severity-blast-radius",
];

// Phase 2: Response workers — recruited by Commander after Phase 1 evaluates SEV
const PHASE_2_FULL  = ["responder-allocation", "dependency-impact-sim", "mitigation-projection", "runbook-advisor"];
const PHASE_2_LIGHT = ["responder-allocation", "runbook-advisor"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sevToLegacy(sevLevel: string): 'low' | 'medium' | 'high' | 'critical' {
  if (sevLevel === 'SEV-1') return 'critical';
  if (sevLevel === 'SEV-2') return 'high';
  if (sevLevel === 'SEV-3') return 'medium';
  return 'low';
}

// When a higher-priority incident reclaims units from lower-priority ones,
// the victims must know: update their incident docs and post a status message
// into each victim's Band room so the loss is visible and audited.
async function notifyReallocations(
  reallocations: import("./resourceManager").Reallocation[],
  toIncidentId: string
): Promise<void> {
  for (const r of reallocations) {
    try {
      const victim = await Incident.findOneAndUpdate(
        { incidentId: r.fromIncidentId },
        {
          $set:  { [`allocatedResources.${r.type}`]: r.remaining },
          $push: { resourceTradeoffs: `${r.count} ${r.type}(s) reallocated to higher-priority incident ${toIncidentId}` },
        },
        { new: true }
      );
      if (victim?.roomId) {
        await bandAdapter.post(victim.roomId, {
          msg_type:                'status',
          from_agent:              'incident-commander',
          incident_id:             r.fromIncidentId,
          step:                    'resource-reallocation',
          payload: {
            message: `${r.count} ${r.type}(s) reallocated to higher-priority incident ${toIncidentId} — ${r.remaining} remaining`,
            reallocatedTo: toIncidentId,
            type: r.type,
            count: r.count,
            remaining: r.remaining,
          },
          confidence:              1.0,
          requires_human_approval: false,
        }).catch(() => {});
      }
      if (victim) eventBus.emit('incident:updated', { incident: victim });
    } catch (err: any) {
      console.warn(`[Resources] Reallocation notice failed for ${r.fromIncidentId}:`, err.message);
    }
  }
}

// Band posting callback — passed to each pipeline phase so findings appear live
function makeBandHook(roomId: string, incidentId: string) {
  return async (agentId: string, result: AgentResult): Promise<void> => {
    await bandAdapter.post(roomId, {
      msg_type:                'finding',
      from_agent:              agentId,
      incident_id:             incidentId,
      step:                    agentId,
      payload:                 result.output ?? {},
      confidence:              result.confidence ?? 0.5,
      requires_human_approval: false,
      engine:                  result.engine,
    }).catch(() => {});
  };
}

// ─── IncidentService ──────────────────────────────────────────────────────────

export class IncidentService {

  // ── Signal Ingestion — the main Band-coordinated flow ─────────────────────
  //
  // Flow: create room → Phase 1 (post findings live) → CommanderTriage (recruit)
  //       → Phase 2 (post findings live) → Commander synthesis + approval_request
  //       → background gate: on approval run Comms + update status; on veto retract.

  static async processNewSignal(signalData: Partial<ISignal>) {
    const signal   = await Signal.create(signalData);
    const taskId   = uuidv4();
    const incidentId = uuidv4();
    const resourceSnapshot = resourceManager.getStatus();

    // 1. Open Band room BEFORE pipeline — operators see the room immediately
    const room = await bandAdapter.createRoom(incidentId);
    const CORE_AGENTS = [
      'intake-normalization', 'correlation-dedup', 'validation-credibility',
      'classification', 'severity-blast-radius', 'incident-commander',
    ];
    for (const a of CORE_AGENTS) await bandAdapter.joinRoom(room.room_id, a);

    // 2. Persist room stub so the operator view can display it right away
    await BandRoomModel.create({
      room_id:      room.room_id,
      incident_id:  incidentId,
      participants: room.participants,
      status:       'open',
      created_at:   new Date(),
    }).catch(() => {});

    // 3. Create incident stub (status=analyzing) — visible in the operator list immediately
    let incident = await Incident.create({
      incidentId,
      roomId:     room.room_id,
      type:       'unknown',
      severity:   'low',
      status:     'analyzing',
      confidence: 0,
      signals:    [signal._id],
      taskId,
      metadata:   {},
    });
    eventBus.emit('incident:created', { incident });

    const initialTask: AgentTask = {
      id:   taskId,
      type: 'signal_ingestion',
      data: signal.toObject(),
      context: {
        resourcePool:      resourceSnapshot.pool,
        availableNow:      resourceSnapshot.available,
        activeCrises:      resourceSnapshot.activeIncidents,
        totalActiveCrises: resourceSnapshot.activeIncidents.length,
      },
    };

    // 4. PHASE 1 — core intelligence; each finding is posted to Band in real-time
    const phase1Trace = await nexusOrchestrator.runPipeline(
      taskId, initialTask, PHASE_1, makeBandHook(room.room_id, incidentId)
    );

    if (phase1Trace.status !== 'completed') {
      await Incident.findOneAndUpdate({ incidentId }, { status: 'retracted' });
      eventBus.emit('incident:retracted', { incidentId });
      return { signal, trace: phase1Trace, error: 'Phase 1 pipeline failed' };
    }

    const phase1Context = Object.fromEntries(phase1Trace.results.map(r => [r.agentId, r.output]));

    // 5. CommanderTriage (NexusAgent) — evaluates SEV, decides which Phase-2 agents to recruit
    const triageAgent   = new CommanderTriageAgent(bandAdapter);
    const triggerMsg    = buildTriggerMsg(incidentId, room.room_id, { ...initialTask, context: phase1Context });
    const triageMsg     = await triageAgent.run(room.room_id, triggerMsg, phase1Context);
    const recruitedAgents: string[] = triageMsg?.payload?.agentsRecruited ?? PHASE_2_FULL;

    // 6. Recruit Phase-2 agents into Band room (visible in operator view)
    for (const agentRole of recruitedAgents) {
      await bandAdapter.recruit(room.room_id, agentRole);
    }
    await bandAdapter.joinRoom(room.room_id, 'human-commander');

    // 7. PHASE 2 — recruited workers; each finding posted to Band in real-time
    const phase2Agents = recruitedAgents.filter(a => a !== 'stakeholder-comms');
    const phase2Task: AgentTask = {
      ...initialTask,
      context: { ...initialTask.context, ...phase1Context },
    };

    const phase2Trace = await nexusOrchestrator.runPipeline(
      `${taskId}-p2`, phase2Task, phase2Agents, makeBandHook(room.room_id, incidentId)
    );

    const phase2Context = Object.fromEntries(phase2Trace.results.map(r => [r.agentId, r.output]));

    // 8. Final Commander synthesis — runs outside the pipeline so we can post as approval_request
    const cmdAgent = nexusOrchestrator.getAgent('incident-commander');
    if (!cmdAgent) {
      await Incident.findOneAndUpdate({ incidentId }, { status: 'retracted' });
      return { signal, error: 'incident-commander not registered' };
    }

    const allContext   = { ...phase1Context, ...phase2Context, resourcePool: resourceSnapshot.pool };
    const cmdTask      = { ...initialTask, context: allContext };
    const cmdResult    = await cmdAgent.execute(cmdTask);
    const cmdOutput    = cmdResult.output ?? {};
    const requiresApproval = !!(cmdOutput?.recommendedAction?.requiresHumanApproval);

    const cmdMsg = await bandAdapter.post(room.room_id, {
      msg_type:                requiresApproval ? 'approval_request' : 'proposal',
      from_agent:              'incident-commander',
      incident_id:             incidentId,
      step:                    'final-commander',
      payload:                 cmdOutput,
      confidence:              cmdResult.confidence ?? 0.7,
      requires_human_approval: requiresApproval,
    });

    // 9. Resource allocation (enterprise pool — no location required)
    const sevLevel  = cmdOutput?.sevLevel ?? phase1Context['severity-blast-radius']?.sevLevel ?? 'SEV-3';
    const severity  = sevToLegacy(sevLevel);
    const resourceResult = resourceManager.allocate({
      incidentId,
      incidentType: cmdOutput?.type ?? phase1Context['classification']?.primaryType ?? 'Unknown',
      severity,
      confidence:   cmdResult.confidence ?? 0.6,
    });
    await notifyReallocations(resourceResult.reallocations, incidentId);

    // 10. Build combined trace log
    const allResults = [...phase1Trace.results, ...phase2Trace.results, cmdResult];
    const traceLog = allResults.map((r, idx) => ({
      step:       `STEP_${String(idx + 1).padStart(2, '0')}`,
      agent:      r.agentId,
      decision:   r.output?.commanderSummary ?? r.reasoning ?? 'Agent completed',
      reason:     r.reasoning ?? '',
      confidence: r.confidence as number | undefined,
      timestamp:  r.timestamp,
    }));
    for (const rStep of resourceResult.trace_log) {
      traceLog.push({ step: rStep.step, agent: 'resource-manager', decision: rStep.decision, reason: rStep.reason, confidence: undefined, timestamp: Date.now() });
    }

    const allocOutput = phase2Context['responder-allocation'];
    const mitigOutput = phase2Context['mitigation-projection'];
    const runbookOut  = phase2Context['runbook-advisor'];
    const credOutput  = phase1Context['validation-credibility'];
    const classOutput = phase1Context['classification'];
    const depSimOut   = phase2Context['dependency-impact-sim'];
    const sevOutput   = phase1Context['severity-blast-radius'];

    // 11. Persist fully-enriched incident (no location — enterprise incidents are region-based)
    const updatedDoc = await Incident.findOneAndUpdate(
      { incidentId },
      {
        type:       cmdOutput?.type     ?? classOutput?.primaryType ?? 'unknown',
        subType:    cmdOutput?.subType  ?? classOutput?.subType,
        severity, sevLevel,
        status:     'active',
        confidence: cmdResult.confidence ?? 0.7,
        $addToSet:  { signals: signal._id },
        blastRadius:          sevOutput?.blastRadius ?? cmdOutput?.blastRadius,
        slaBreachRisk:        sevOutput?.slaBreachRisk,
        responderAssignments: allocOutput?.assignments,
        allocatedResources:   resourceResult.granted,
        resourcePriorityRank: resourceResult.priorityRank,
        resourceTradeoffs:    resourceResult.tradeoffs,
        confidenceBreakdown:  credOutput?.credibilityAssessment ?? null,
        pendingApprovalId:    requiresApproval ? cmdMsg.id : null,
        traceLog,
        metadata: {
          commanderSummary:     cmdOutput?.commanderSummary,
          recommendedAction:    cmdOutput?.recommendedAction,
          agentsRecruited:      recruitedAgents,
          mitigations:          mitigOutput?.recommendedMitigations,
          runbook:              runbookOut,
          cascadeGraph:         depSimOut?.cascadeGraph,
          resourceDenied:       resourceResult.denied,
          totalActiveCrises:    resourceResult.totalActive,
          requiresHumanApproval: requiresApproval,
        },
      },
      { new: true }
    );
    incident = (updatedDoc ?? incident) as any;

    eventBus.emit('incident:updated', { incident });
    eventBus.emit('resources:updated', resourceManager.getStatus());
    notifyUsersNearIncident(incident as any).catch(console.error);

    // 12. Approval gate — background watcher: on approval run comms; on veto retract
    if (requiresApproval) {
      setImmediate(async () => {
        try {
          const decision = await createApprovalGate(cmdMsg.id, room.room_id, incidentId);

          if (decision === 'approved') {
            // Run Stakeholder-Comms AFTER human approval (gated for high-stakes comms)
            const commsTask = { ...cmdTask, context: { ...allContext, 'incident-commander': cmdOutput } };
            const commsTrace = await nexusOrchestrator.runPipeline(
              `${taskId}-comms`, commsTask, ['stakeholder-comms'],
              makeBandHook(room.room_id, incidentId)
            );
            const commsOutput = commsTrace.results[0]?.output;

            await Incident.findOneAndUpdate(
              { incidentId },
              {
                status:           'active',
                approvedBy:       'human-commander',
                approvedAt:       new Date(),
                pendingApprovalId: null,
                'metadata.stakeholderMessages': commsOutput ?? null,
              }
            );

            await bandAdapter.post(room.room_id, {
              msg_type:                'status',
              from_agent:              'incident-commander',
              incident_id:             incidentId,
              step:                    'approval-confirmed',
              payload:                 { status: 'active', message: 'Human Commander approved. Response in progress.' },
              confidence:              1.0,
              requires_human_approval: false,
            }).catch(() => {});

            eventBus.emit('incident:updated', { incidentId, status: 'active' });

          } else {
            // Vetoed — retract and release resources
            await Incident.findOneAndUpdate({ incidentId }, { status: 'retracted', pendingApprovalId: null });

            await bandAdapter.post(room.room_id, {
              msg_type:                'retraction',
              from_agent:              'incident-commander',
              incident_id:             incidentId,
              step:                    'veto-retraction',
              payload:                 { reason: 'Human Commander vetoed action', rolledBackSteps: ['resource_allocation', 'stakeholder_comms'] },
              confidence:              1.0,
              requires_human_approval: false,
            }).catch(() => {});

            resourceManager.release(incidentId);
            await bandAdapter.closeRoom(room.room_id);
            await (BandRoomModel as any).findOneAndUpdate({ room_id: room.room_id }, { $set: { status: 'closed', closed_at: new Date() } }).catch(() => {});
            eventBus.emit('incident:retracted', { incidentId, reason: 'vetoed' });
            eventBus.emit('resources:updated', resourceManager.getStatus());
          }
        } catch (err) {
          console.error('[NEXUS] Approval gate watcher failed:', err);
        }
      });
    } else {
      // No approval required — run comms immediately
      const commsTask = { ...cmdTask, context: { ...allContext, 'incident-commander': cmdOutput } };
      const commsTrace = await nexusOrchestrator.runPipeline(
        `${taskId}-comms`, commsTask, ['stakeholder-comms'],
        makeBandHook(room.room_id, incidentId)
      );
      const commsOutput = commsTrace.results[0]?.output;
      if (commsOutput) {
        await Incident.findOneAndUpdate({ incidentId }, { 'metadata.stakeholderMessages': commsOutput });
      }
    }

    return {
      incident,
      trace: {
        taskId,
        results:    allResults,
        status:     'completed' as const,
        startedAt:  phase1Trace.startedAt,
        endedAt:    Date.now(),
        durationMs: Date.now() - phase1Trace.startedAt,
      },
      resourceAllocation: resourceResult,
      roomId: room.room_id,
    };
  }

  // ── Manual Report ─────────────────────────────────────────────────────────

  static async processManualReport(
    signalData: Partial<ISignal>,
    manualLocation?: { lat: number; lng: number }
  ) {
    const signal      = await Signal.create({ ...signalData, location: manualLocation });
    const taskId      = uuidv4();
    const incidentId  = uuidv4();

    const incident = await Incident.create({
      incidentId,
      type:       'Manual Report',
      severity:   'medium',
      status:     'unverified',
      ...(manualLocation ? { location: manualLocation } : {}),
      radius:     500,
      confidence: 0,
      signals:    [signal._id],
      taskId,
      metadata:   { manualReport: true, rawReport: signalData.data?.text ?? '' },
    });

    eventBus.emit('incident:created', { incident });

    setImmediate(async () => {
      try {
        const resourceSnapshot = resourceManager.getStatus();
        const phase1Trace = await nexusOrchestrator.runPipeline(taskId, {
          id:   taskId,
          type: 'signal_ingestion',
          data: signal.toObject(),
          context: {
            manualLocation,
            resourcePool:      resourceSnapshot.pool,
            availableNow:      resourceSnapshot.available,
            activeCrises:      resourceSnapshot.activeIncidents,
            totalActiveCrises: resourceSnapshot.activeIncidents.length,
          },
        }, PHASE_1);

        if (phase1Trace.status !== 'completed') {
          await Incident.findOneAndUpdate({ incidentId }, { status: 'retracted' });
          eventBus.emit('incident:retracted', { incidentId });
          return;
        }

        const phase1Context = Object.fromEntries(phase1Trace.results.map(r => [r.agentId, r.output]));
        const credOutput    = phase1Context['validation-credibility'];
        const sevOutput     = phase1Context['severity-blast-radius'];
        const sevLevel      = sevOutput?.sevLevel ?? 'SEV-3';
        const severity      = sevToLegacy(sevLevel);

        // Confidence check
        const weightedScore = credOutput?.credibilityAssessment?.weightedScore ?? 0.5;
        if (weightedScore < 0.4) {
          await Incident.findOneAndUpdate({ incidentId }, { status: 'retracted' });
          eventBus.emit('incident:retracted', { incidentId });
          return;
        }

        const room = await bandAdapter.createRoom(incidentId);
        for (const a of ['intake-normalization','correlation-dedup','validation-credibility','classification','severity-blast-radius','incident-commander','human-commander']) {
          await bandAdapter.joinRoom(room.room_id, a);
        }
        for (const r of phase1Trace.results) {
          await bandAdapter.post(room.room_id, {
            msg_type: 'finding', from_agent: r.agentId, incident_id: incidentId, step: r.agentId,
            payload: r.output ?? {}, confidence: r.confidence ?? 0.5, requires_human_approval: false,
          }).catch(() => {});
        }
        await BandRoomModel.create({ room_id: room.room_id, incident_id: incidentId, participants: room.participants, status: 'open', created_at: new Date() }).catch(() => {});

        const resourceResult = resourceManager.allocate({ incidentId, incidentType: phase1Context['classification']?.primaryType ?? 'Unknown', severity, confidence: 0.6, ...(manualLocation ? { location: manualLocation } : {}) });
        await notifyReallocations(resourceResult.reallocations, incidentId);

        const updatedIncident = await Incident.findOneAndUpdate(
          { incidentId },
          {
            roomId:   room.room_id,
            type:     phase1Context['classification']?.primaryType ?? 'Manual Report',
            subType:  phase1Context['classification']?.subType,
            severity, sevLevel, status: 'active',
            ...(manualLocation ? { location: manualLocation } : {}),
            radius: 1000, confidence: weightedScore,
            blastRadius: sevOutput?.blastRadius,
            slaBreachRisk: sevOutput?.slaBreachRisk,
            allocatedResources: resourceResult.granted,
            confidenceBreakdown: credOutput?.credibilityAssessment ?? null,
            metadata: { manualReport: true, rawReport: signalData.data?.text ?? '' },
          },
          { new: true }
        );

        eventBus.emit('incident:updated', updatedIncident);
        eventBus.emit('resources:updated', resourceManager.getStatus());
        notifyUsersNearIncident(updatedIncident as any).catch(console.error);
      } catch (err) {
        console.error('[NEXUS] Manual report pipeline failed:', err);
        await Incident.findOneAndUpdate({ incidentId }, { status: 'retracted' }).catch(() => {});
        eventBus.emit('incident:retracted', { incidentId });
      }
    });

    return { signal, incident, message: 'Report received — verification in progress' };
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  static async getIncidents() {
    return Incident.find({ status: { $nin: ['closed', 'retracted'] } }).sort({ updatedAt: -1 });
  }

  static async getActiveCrisesWithResources() {
    const incidents  = await Incident.find({ status: { $nin: ['closed', 'retracted'] } }).sort({ updatedAt: -1 });
    const resourceMap = resourceManager.getStatus();
    const traces     = incidents.map(inc => ({
      incidentId: inc.incidentId,
      traceLog:   inc.traceLog ?? [],
      taskId:     inc.taskId,
    }));
    return { incidents, resourceMap, traces };
  }

  static async getIncidentById(id: string) {
    return Incident.findOne({ incidentId: id }).populate('signals');
  }

  // ── Verification / False-Positive Recovery ────────────────────────────────

  static async verifyIncident(incidentId: string, status: string, fieldReport?: any) {
    const incident = await Incident.findOne({ incidentId }).populate('signals');
    if (!incident) return null;

    const taskId = uuidv4();
    const trace = await nexusOrchestrator.runPipeline(taskId, {
      id:   taskId,
      type: 'incident_verification',
      data: { incident: incident.toObject(), verificationStatus: status, fieldReport: fieldReport ?? null },
      context: { resourcePool: resourceManager.getStatus().pool, activeIncidents: resourceManager.getStatus().activeIncidents },
    }, ['validation-credibility', 'mitigation-projection', 'incident-commander']);

    const credOutput     = trace.results.find(r => r.agentId === 'validation-credibility')?.output;
    const cmdOutput      = trace.results.find(r => r.agentId === 'incident-commander')?.output;
    const isFalsePositive = status === 'false_alarm'
      || credOutput?.conflictResolution?.status === 'LIKELY_FALSE_POSITIVE';

    const newStatus = isFalsePositive ? 'retracted' : (cmdOutput?.status ?? 'active') as any;

    if (isFalsePositive && incident.roomId) {
      await bandAdapter.post(incident.roomId, {
        msg_type:                'retraction',
        from_agent:              'incident-commander',
        incident_id:             incidentId,
        step:                    'false_positive_retraction',
        payload:                 { reason: fieldReport?.reason ?? 'false_alarm', rolledBackSteps: ['public_alert', 'resource_allocation'] },
        confidence:              1.0,
        requires_human_approval: false,
      }).catch(() => {});
    }

    const newTraceSteps = trace.results.map((r, idx) => ({
      step:       `VER_STEP_${String(idx + 1).padStart(2, '0')}`,
      agent:      r.agentId,
      decision:   r.reasoning ?? 'Verification agent completed',
      reason:     isFalsePositive ? 'False-positive retraction initiated' : 'Incident verified',
      confidence: r.confidence,
      timestamp:  r.timestamp,
    }));

    incident.status   = newStatus;
    incident.traceLog = [...(incident.traceLog ?? []), ...newTraceSteps] as any;
    incident.metadata = {
      ...(incident.metadata ?? {}),
      verificationResult: credOutput?.conflictResolution?.status,
      isFalsePositive,
    };
    await incident.save();

    if (isFalsePositive || newStatus === 'closed') {
      resourceManager.release(incidentId);
      eventBus.emit('incident:retracted', { incidentId, reason: isFalsePositive ? 'false_alarm' : 'closed', trace });
      eventBus.emit('resources:updated', resourceManager.getStatus());
      if (incident.roomId) {
        await bandAdapter.closeRoom(incident.roomId).catch(() => {});
        await (BandRoomModel as any).findOneAndUpdate({ room_id: incident.roomId }, { $set: { status: 'closed', closed_at: new Date() } }).catch(() => {});
      }
    } else {
      eventBus.emit('incident:updated', { incident, trace });
    }

    return { incident, trace, isFalsePositive };
  }
}

type IIncidentModel = import("../models/index").IIncident;
