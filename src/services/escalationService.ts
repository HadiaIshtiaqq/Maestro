/**
 * escalationService.ts
 *
 * Runs a background check every 3 minutes.
 * Any incident that has been in "analyzing" or "detected" status for longer
 * than ESCALATION_THRESHOLD_MS is automatically escalated to "active" and
 * an incident:updated event is broadcast so the ECC reflects the change.
 */

import { Incident } from "../models/index";
import { eventBus } from "../events/eventBus";
import { resourceManager } from "./resourceManager";

const ESCALATION_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const CHECK_INTERVAL_MS       =  3 * 60 * 1000; //  3 minutes

let _timer: ReturnType<typeof setInterval> | null = null;

async function runEscalationCheck(): Promise<void> {
  const cutoff = new Date(Date.now() - ESCALATION_THRESHOLD_MS);

  try {
    const stale = await Incident.find({
      status:    { $in: ["analyzing", "detected"] },
      updatedAt: { $lt: cutoff },
    });

    if (stale.length === 0) return;

    for (const inc of stale) {
      await Incident.findOneAndUpdate(
        { incidentId: inc.incidentId },
        {
          $set: {
            status: "active",
            "metadata.autoEscalatedAt":     new Date(),
            "metadata.autoEscalationReason": `No operator action for ${Math.round(ESCALATION_THRESHOLD_MS / 60000)} minutes`,
          },
        },
      );

      const updated = await Incident.findOne({ incidentId: inc.incidentId });
      if (updated) {
        eventBus.emit("incident:escalated", { incident: updated });
      }

      console.log(`[Escalation] Auto-escalated incident ${inc.incidentId} (was ${inc.status} since ${inc.updatedAt.toISOString()})`);
    }

    if (stale.length > 0) {
      eventBus.emit("resources:updated", resourceManager.getStatus());
    }
  } catch (err) {
    console.error("[Escalation] Check failed:", err);
  }
}

export function startEscalationService(): void {
  if (_timer) return;
  _timer = setInterval(runEscalationCheck, CHECK_INTERVAL_MS);
  console.log(`[Escalation] Auto-escalation service started (threshold: ${ESCALATION_THRESHOLD_MS / 60000}min, interval: ${CHECK_INTERVAL_MS / 60000}min)`);
}

export function stopEscalationService(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
