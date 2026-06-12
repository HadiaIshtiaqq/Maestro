// ─── Enterprise Resource Pool ─────────────────────────────────────────────────
// On-call headcount available to NEXUS for incident response.
// Adjust these to demonstrate resource contention in the stress-test scenario.

export const RESOURCE_POOL = {
  sre:        12,   // Site Reliability Engineers
  seceng:      6,   // Security Engineers
  dataeng:     4,   // Data / DB Engineers
  ic:          3,   // Incident Commanders (senior IC available for handoff)
  compliance:  2,   // Compliance Officers (DORA / SOC2 / GDPR notification)
} as const;

export type ResourceType = keyof typeof RESOURCE_POOL;

// ─── Type Definitions ────────────────────────────────────────────────────────

export interface ResourceAllocation {
  incidentId:    string;
  incidentType:  string;
  severity:      string;
  priorityScore: number;
  allocated:     Record<ResourceType, number>;
  allocatedAt:   number;
}

export interface AllocationRequest {
  incidentId:    string;
  incidentType:  string;
  severity:      'low' | 'medium' | 'high' | 'critical';
  confidence:    number;
  location?:     { lat: number; lng: number };  // optional — enterprise incidents may omit
  requestedResources?: Record<ResourceType, number>;
}

export interface Reallocation {
  fromIncidentId: string;
  type:           ResourceType;
  count:          number;
  remaining:      number;   // what the victim incident still holds of this type
}

export interface AllocationResult {
  granted:       Record<ResourceType, number>;
  denied:        Record<ResourceType, number>;
  priorityRank:  number;
  totalActive:   number;
  tradeoffs:     string[];
  reallocations: Reallocation[];
  trace_log:     Array<{ step: string; decision: string; reason: string }>;
}

// ─── Resource Requirements by Enterprise Incident Type ────────────────────────
// Base needs at Medium severity. Multiplied by severity in defaultRequirements().

const RESOURCE_REQUIREMENTS: Record<string, Record<ResourceType, number>> = {
  'security':         { sre: 2, seceng: 2, dataeng: 0, ic: 1, compliance: 1 },
  'outage':           { sre: 3, seceng: 0, dataeng: 1, ic: 1, compliance: 0 },
  'data_integrity':   { sre: 1, seceng: 1, dataeng: 2, ic: 1, compliance: 1 },
  'performance':      { sre: 2, seceng: 0, dataeng: 1, ic: 0, compliance: 0 },
  'compliance_event': { sre: 1, seceng: 1, dataeng: 1, ic: 1, compliance: 2 },
  'default':          { sre: 2, seceng: 1, dataeng: 1, ic: 1, compliance: 0 },
};

// Priority weight per severity level
const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high:     3,
  medium:   2,
  low:      1,
};

// ─── ResourceManager Singleton ───────────────────────────────────────────────

export class ResourceManager {
  private allocations: Map<string, ResourceAllocation> = new Map();

  // ── Helpers ──────────────────────────────────────────────────────────────

  private computePriority(severity: string, confidence: number, allocatedAt?: number): number {
    const base = (SEVERITY_WEIGHT[severity] ?? 1) * confidence;
    const ageBonus = allocatedAt
      ? Math.min((Date.now() - allocatedAt) / 60_000 * 0.1, 2)
      : 0;
    return parseFloat((base + ageBonus).toFixed(3));
  }

  private emptyPool(): Record<ResourceType, number> {
    return Object.fromEntries(
      (Object.keys(RESOURCE_POOL) as ResourceType[]).map(t => [t, 0])
    ) as Record<ResourceType, number>;
  }

  private getAvailable(): Record<ResourceType, number> {
    const deployed = this.emptyPool();
    for (const alloc of this.allocations.values()) {
      for (const type of Object.keys(RESOURCE_POOL) as ResourceType[]) {
        deployed[type] += alloc.allocated[type] ?? 0;
      }
    }
    const available = {} as Record<ResourceType, number>;
    for (const type of Object.keys(RESOURCE_POOL) as ResourceType[]) {
      available[type] = RESOURCE_POOL[type] - deployed[type];
    }
    return available;
  }

  private defaultRequirements(incidentType: string, severity: string): Record<ResourceType, number> {
    const normalized = incidentType.toLowerCase().replace(/[\s-]/g, '_');
    const key = Object.keys(RESOURCE_REQUIREMENTS).find(k => normalized.includes(k)) ?? 'default';
    const base = RESOURCE_REQUIREMENTS[key];
    const mul = severity === 'critical' ? 1.5 : severity === 'high' ? 1.2 : 1.0;
    const result = {} as Record<ResourceType, number>;
    for (const type of Object.keys(RESOURCE_POOL) as ResourceType[]) {
      result[type] = Math.ceil((base[type] ?? 0) * mul);
    }
    return result;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Allocate resources to a new or updated incident using a priority matrix.
   * If this incident outranks existing ones it may reclaim units from lower-priority crises.
   * Every decision is recorded in the returned `trace_log`.
   */
  allocate(req: AllocationRequest): AllocationResult {
    const needed    = req.requestedResources ?? this.defaultRequirements(req.incidentType, req.severity);
    const available = this.getAvailable();
    const traceLog: AllocationResult['trace_log'] = [];
    const granted   = this.emptyPool();
    const denied    = this.emptyPool();
    const tradeoffs: string[] = [];
    const reallocations: Reallocation[] = [];

    const priorityScore = this.computePriority(req.severity, req.confidence);

    traceLog.push({
      step:     'PRIORITY_SCORING',
      decision: `Incident ${req.incidentId} scored ${priorityScore}`,
      reason:   `severity(${req.severity})=${SEVERITY_WEIGHT[req.severity] ?? 1} × confidence(${req.confidence.toFixed(2)}) = ${priorityScore}`,
    });

    const lowerCrises = [...this.allocations.values()]
      .filter(a => a.priorityScore < priorityScore)
      .sort((a, b) => a.priorityScore - b.priorityScore);

    for (const type of Object.keys(RESOURCE_POOL) as ResourceType[]) {
      const want = needed[type] ?? 0;
      if (want === 0) continue;

      if (available[type] >= want) {
        granted[type] = want;
        traceLog.push({
          step:     `GRANT_${type.toUpperCase()}`,
          decision: `Granted ${want} ${type}(s) to ${req.incidentId}`,
          reason:   `Pool has ${available[type]} free of ${RESOURCE_POOL[type]} total`,
        });
      } else {
        let shortfall = want - available[type];
        granted[type] = available[type];

        for (const lower of lowerCrises) {
          if (shortfall <= 0) break;
          const canTake = Math.min(lower.allocated[type] ?? 0, shortfall);
          if (canTake > 0) {
            lower.allocated[type] = (lower.allocated[type] ?? 0) - canTake;
            granted[type] += canTake;
            shortfall     -= canTake;
            reallocations.push({
              fromIncidentId: lower.incidentId,
              type,
              count:     canTake,
              remaining: lower.allocated[type],
            });
            const msg = `Reallocated ${canTake} ${type}(s) from ${lower.incidentId} ` +
              `(priority ${lower.priorityScore}) → ${req.incidentId} (priority ${priorityScore})`;
            tradeoffs.push(msg);
            traceLog.push({
              step:     `REALLOC_${type.toUpperCase()}`,
              decision: msg,
              reason:   `${req.incidentId} priority (${priorityScore}) > ${lower.incidentId} priority (${lower.priorityScore})`,
            });
          }
        }

        if (shortfall > 0) {
          denied[type] = shortfall;
          const msg = `Insufficient ${type}: requested ${want}, granted ${granted[type]}, denied ${shortfall}`;
          tradeoffs.push(msg);
          traceLog.push({
            step:     `DENY_${type.toUpperCase()}`,
            decision: msg,
            reason:   `All ${RESOURCE_POOL[type]} ${type}(s) deployed to equal-/higher-priority incidents`,
          });
        }
      }
    }

    this.allocations.set(req.incidentId, {
      incidentId:    req.incidentId,
      incidentType:  req.incidentType,
      severity:      req.severity,
      priorityScore,
      allocated:     { ...granted },
      allocatedAt:   Date.now(),
    });

    const allScores    = [...this.allocations.values()].map(a => a.priorityScore).sort((a, b) => b - a);
    const priorityRank = allScores.indexOf(priorityScore) + 1;

    return { granted, denied, priorityRank, totalActive: this.allocations.size, tradeoffs, reallocations, trace_log: traceLog };
  }

  /**
   * Free all resources held by an incident (on resolution or false-positive retraction).
   */
  release(incidentId: string): void {
    this.allocations.delete(incidentId);
  }

  /**
   * Return a snapshot of pool utilisation — used by GET /resources/status.
   */
  getStatus() {
    const available = this.getAvailable();
    const activeIncidents = [...this.allocations.values()].map(a => ({
      incidentId:    a.incidentId,
      type:          a.incidentType,
      severity:      a.severity,
      priorityScore: a.priorityScore,
      resources:     { ...a.allocated },
    }));

    const deployed = this.emptyPool();
    for (const type of Object.keys(RESOURCE_POOL) as ResourceType[]) {
      deployed[type] = RESOURCE_POOL[type] - available[type];
    }

    return {
      pool:    { ...RESOURCE_POOL },
      available,
      deployed,
      utilizationPct: Object.fromEntries(
        (Object.keys(RESOURCE_POOL) as ResourceType[]).map(t => [
          t,
          parseFloat(((deployed[t] / RESOURCE_POOL[t]) * 100).toFixed(1)),
        ])
      ),
      activeIncidents,
    };
  }

  getRequirementsForType(incidentType: string, severity: string): Record<ResourceType, number> {
    return this.defaultRequirements(incidentType, severity);
  }
}

export const resourceManager = new ResourceManager();
