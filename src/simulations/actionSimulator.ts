import { askGemini } from "../services/geminiService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SimulationInput {
  incidentId:  string;
  actionType:  string;
  parameters:  any;
}

export interface ImpactInput {
  incidentId:    string;
  incidentType:  string;
  severity:      string;
  currentState:  any;
  proposedActions: string[];
  allocatedResources: {
    ambulance: number;
    police:    number;
    fire:      number;
    drone:     number;
  };
}

export interface FalsePositiveInput {
  incidentId:    string;
  incidentType:  string;
  fieldReportId: string;
  alertsSent:    string[];
}

// ─── ActionSimulator ──────────────────────────────────────────────────────────

export class ActionSimulator {

  /**
   * General-purpose action simulation (original contract).
   */
  static async simulate(input: SimulationInput) {
    const prompt = `
You are a Crisis Action Simulation Engine for the NEXUS system.
Simulate the following emergency response action and predict outcomes.

Incident ID : ${input.incidentId}
Action Type : ${input.actionType}
Parameters  : ${JSON.stringify(input.parameters, null, 2)}

Return ONLY this JSON (no markdown):
{
  "beforeState": "<description of current situation>",
  "actionTaken": "<precise description of what was done>",
  "afterState":  "<predicted situation after 1 hour>",
  "metrics": {
    "etaImprovement":    "<e.g. -12 minutes>",
    "congestionImpact":  "<e.g. 20% reduction in bottleneck severity>",
    "resourceCost":      "<e.g. 3 ambulances, 2 police units for 4 hours>",
    "livesAtRisk":       "<before vs after>",
    "successProbability": <0.0–1.0>
  },
  "failureProbability": <0.0–1.0>,
  "sideEffects": ["<unintended consequence>"],
  "trace_log": [
    { "step": "<step id>", "decision": "<what was decided>", "reason": "<why>" }
  ]
}`;

    return await askGemini(prompt);
  }

  /**
   * simulateImpact — predicts the before/after state after dispatching resources.
   * Used by POST /simulate/impact to demonstrate concrete outcome improvement.
   */
  static async simulateImpact(input: ImpactInput) {
    const prompt = `
You are the NEXUS Impact Simulation Engine.
Predict the before and after state of a crisis intervention. Be specific with numbers.

Incident ID  : ${input.incidentId}
Incident Type: ${input.incidentType}
Severity     : ${input.severity}
Current State: ${JSON.stringify(input.currentState, null, 2)}
Proposed Actions: ${JSON.stringify(input.proposedActions)}
Allocated Resources: ${JSON.stringify(input.allocatedResources)}

Return ONLY this JSON (no markdown):
{
  "incidentId": "${input.incidentId}",
  "beforeState": {
    "description":        "<snapshot of situation before intervention>",
    "estimatedCasualties": <number>,
    "trafficCongestion":  "<percentage of roads affected>",
    "populationAtRisk":   <number>
  },
  "interventionActions": [
    { "action": "<what is being done>", "resourcesDeployed": "<units>", "etaMinutes": <number> }
  ],
  "afterState": {
    "description":              "<predicted situation 1 hour after intervention>",
    "trafficReduction":         "<e.g. 20% reduction in congestion>",
    "casualtyReduction":        "<e.g. Estimated 15 fewer casualties>",
    "estimatedResolutionTime":  "<e.g. 3 hours>",
    "residualRisk":             "<low | medium | high>"
  },
  "metrics": {
    "etaImprovement":      "<e.g. Emergency vehicles arrive 12 min faster>",
    "congestionImpact":    "<e.g. Main Blvd congestion drops from severe to moderate>",
    "resourceEfficiency":  "<e.g. 85% of deployed units actively engaged>",
    "successProbability":  <0.0–1.0>
  },
  "trace_log": [
    { "step": "<STEP_N>", "decision": "<simulation decision>", "reason": "<basis for projection>" }
  ]
}`;

    return await askGemini(prompt);
  }

  /**
   * simulateFalsePositiveRecovery — models the full rollback sequence when a field report
   * marks an incident as a false alarm. Returns the retraction steps and dashboard update plan.
   */
  static async simulateFalsePositiveRecovery(input: FalsePositiveInput) {
    const prompt = `
You are the NEXUS False Positive Recovery Simulator.
A field report has come in marking incident ${input.incidentId} (${input.incidentType}) as a FALSE ALARM.
Model the complete retraction and recovery process.

Field Report ID : ${input.fieldReportId}
Alerts Sent     : ${JSON.stringify(input.alertsSent)}

Return ONLY this JSON (no markdown):
{
  "incidentId": "${input.incidentId}",
  "fieldReportId": "${input.fieldReportId}",
  "retractionPlan": {
    "immediateActions": [
      "<e.g. Cancel public SMS alert>",
      "<e.g. Notify hospitals: stand down trauma protocol>",
      "<e.g. Redirect deployed ambulances back to base>",
      "<e.g. Lift emergency traffic signal overrides>"
    ],
    "dashboardUpdates": [
      "<e.g. Mark incident INC-001 as RETRACTED>",
      "<e.g. Release 3 ambulances and 2 police units back to pool>",
      "<e.g. Update resource utilisation bar chart>"
    ],
    "publicCommunication": {
      "channel": "SMS / Social Media",
      "message": "<correction notice to the public>"
    },
    "estimatedRollbackTime": "<e.g. 8 minutes>"
  },
  "antigravityTraceCorrection": {
    "originalTaskId": "<task id that created the false positive>",
    "correctionNote": "<what went wrong in the signal fusion / credibility chain>",
    "modelAdjustment": "<suggested threshold or weight change to prevent recurrence>",
    "loggedAt": "<ISO timestamp placeholder>"
  },
  "resourcesReleased": {
    "ambulance": <integer>,
    "police":    <integer>,
    "fire":      <integer>,
    "drone":     <integer>
  },
  "trace_log": [
    { "step": "FP_STEP_01", "decision": "Field report received", "reason": "Ground truth contradicts sensor/social data" },
    { "step": "FP_STEP_02", "decision": "<next retraction step>", "reason": "<why this is the correct next action>" }
  ]
}`;

    return await askGemini(prompt);
  }
}
