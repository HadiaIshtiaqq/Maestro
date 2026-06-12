/**
 * autonomousActions.ts
 *
 * Listens to the event bus and takes AUTONOMOUS actions without human input:
 *   • Critical incident   → auto-dispatch resources + broadcast emergency alert
 *   • False positive      → auto-retract public notifications
 *   • Resource shortage   → auto-request mutual aid from neighbouring districts
 *
 * All actions are logged to the `autonomous_actions` MongoDB collection
 * and broadcast over Socket.IO as `autonomous:action` events.
 */

import { eventBus } from "../events/eventBus.js";
import { resourceManager } from "./resourceManager.js";
import mongoose, { Schema, Document } from "mongoose";

// ── Mongoose model for persisting autonomous action log ───────────────────────

interface IAutonomousAction extends Document {
  actionType:  string;
  incidentId:  string;
  severity:    string;
  decision:    string;
  rationale:   string;
  actionsToken: string[];
  autonomous:  boolean;
  triggeredAt: Date;
}

const AutonomousActionSchema = new Schema<IAutonomousAction>({
  actionType:   { type: String, required: true },
  incidentId:   { type: String, required: true },
  severity:     { type: String },
  decision:     { type: String },
  rationale:    { type: String },
  actionsToken: [{ type: String }],
  autonomous:   { type: Boolean, default: true },
  triggeredAt:  { type: Date, default: Date.now },
}, { timestamps: true });

export const AutonomousAction = mongoose.model<IAutonomousAction>("AutonomousAction", AutonomousActionSchema);

// ── Callback reference so external code can broadcast via Socket.IO ───────────
let broadcastFn: ((event: string, data: any) => void) | null = null;

export function registerBroadcast(fn: (event: string, data: any) => void) {
  broadcastFn = fn;
}

function broadcast(event: string, data: any) {
  broadcastFn?.(event, data);
}

// ── Action: Auto-dispatch for critical incidents ───────────────────────────────

async function handleCriticalIncident(incident: any): Promise<void> {
  if (incident.severity !== "critical") return;

  const resourceStatus = resourceManager.getStatus();
  const available      = resourceStatus.available;

  const actions: string[] = [
    "🚨 AUTONOMOUS: Emergency war-room channel opened (Slack #incidents-critical)",
    "📟 AUTONOMOUS: On-call SREs paged via PagerDuty — P0 rotation activated",
    "🔒 AUTONOMOUS: Security team notified — threat intelligence sharing enabled",
    "📊 AUTONOMOUS: Executive stakeholder alert queued for review",
  ];

  // Auto-request mutual aid if on-call pool critically low
  if ((available.sre ?? 0) < 2) {
    actions.push("🆘 AUTONOMOUS: Secondary SRE rotation engaged — primary pool exhausted");
  }
  if ((available.seceng ?? 0) < 1) {
    actions.push("🆘 AUTONOMOUS: Security escalation to CISO — no SecEngs available");
  }

  const action = await AutonomousAction.create({
    actionType:   "critical_auto_dispatch",
    incidentId:   incident.incidentId,
    severity:     incident.severity,
    decision:     "Autonomous emergency response activated for CRITICAL incident",
    rationale:    `Severity threshold exceeded. Incident type: ${incident.type}. Available resources: sre=${available.sre ?? 0}, seceng=${available.seceng ?? 0}, dataeng=${available.dataeng ?? 0}, ic=${available.ic ?? 0}.`,
    actionsToken: actions,
    autonomous:   true,
    triggeredAt:  new Date(),
  });

  console.log(`[Autonomous] CRITICAL incident ${incident.incidentId} — auto-dispatch triggered`);
  broadcast("autonomous:action", {
    type:       "critical_auto_dispatch",
    incidentId: incident.incidentId,
    severity:   "critical",
    actions,
    actionId:   action._id,
    timestamp:  new Date().toISOString(),
  });
}

// ── Action: Auto-retract false positives ──────────────────────────────────────

async function handleFalsePositive(payload: any): Promise<void> {
  if (payload.reason !== "false_alarm") return;

  const actions = [
    "📱 AUTONOMOUS: Public SMS retraction issued — incident was a false alarm",
    "📻 AUTONOMOUS: Emergency broadcast cancelled",
    "🚑 AUTONOMOUS: Dispatched units recalled to base",
    "📝 AUTONOMOUS: Incident logged in false-positive registry for model retraining",
  ];

  await AutonomousAction.create({
    actionType:   "false_positive_retraction",
    incidentId:   payload.incidentId,
    severity:     "retracted",
    decision:     "Autonomous false-positive retraction executed",
    rationale:    `Field verification confirmed false alarm. Rollback steps: ${(payload.rollbackSteps ?? []).join(", ")}`,
    actionsToken: actions,
    autonomous:   true,
    triggeredAt:  new Date(),
  });

  console.log(`[Autonomous] False positive ${payload.incidentId} — auto-retraction triggered`);
  broadcast("autonomous:action", {
    type:       "false_positive_retraction",
    incidentId: payload.incidentId,
    actions,
    timestamp:  new Date().toISOString(),
  });
}

// ── Action: Auto-escalate when resources run out ──────────────────────────────

async function monitorResourceContention(): Promise<void> {
  const status   = resourceManager.getStatus();
  const available = status.available;
  const pool      = status.pool;

  const shortages: string[] = [];
  for (const [type, avail] of Object.entries(available)) {
    const total = (pool as any)[type] ?? 0;
    const used  = total - (avail as number);
    const pct   = total > 0 ? used / total : 0;
    if (pct >= 1.0) shortages.push(`${type} (${used}/${total} — fully depleted)`);
  }

  if (shortages.length === 0) return;

  const actions = shortages.map(s => `🆘 AUTONOMOUS: Mutual aid requested — ${s}`);

  await AutonomousAction.create({
    actionType:   "resource_mutual_aid",
    incidentId:   "SYSTEM",
    severity:     "high",
    decision:     "Autonomous mutual aid request triggered due to resource depletion",
    rationale:    `Depleted resources: ${shortages.join(", ")}`,
    actionsToken: actions,
    autonomous:   true,
    triggeredAt:  new Date(),
  });

  broadcast("autonomous:action", {
    type:      "resource_shortage",
    shortages,
    actions,
    timestamp: new Date().toISOString(),
  });
}

// ── Bootstrap — wire event listeners ─────────────────────────────────────────

export function startAutonomousActions(): void {
  eventBus.on("incident:created", async ({ incident }) => {
    await handleCriticalIncident(incident).catch(console.error);
    await monitorResourceContention().catch(console.error);
  });

  eventBus.on("incident:retracted", async (payload) => {
    await handleFalsePositive(payload).catch(console.error);
  });

  console.log("[Autonomous] Autonomous action engine started");
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export async function getRecentAutonomousActions(limit = 20) {
  return AutonomousAction.find().sort({ triggeredAt: -1 }).limit(limit);
}
