import { describe, it, expect, beforeEach } from "vitest";
import { ResourceManager, RESOURCE_POOL } from "../src/services/resourceManager";

describe("ResourceManager", () => {
  let rm: ResourceManager;

  beforeEach(() => {
    rm = new ResourceManager();
  });

  it("grants requested resources when the pool has capacity", () => {
    const result = rm.allocate({
      incidentId: "inc-1",
      incidentType: "outage",
      severity: "high",
      confidence: 0.9,
      requestedResources: { sre: 3, seceng: 0, dataeng: 1, ic: 1, compliance: 0 },
    });
    expect(result.granted.sre).toBe(3);
    expect(result.granted.dataeng).toBe(1);
    expect(result.denied.sre).toBe(0);
    expect(result.reallocations).toHaveLength(0);
  });

  it("reclaims units from lower-priority incidents and records reallocations", () => {
    // Low-priority incident takes most of the SRE pool
    rm.allocate({
      incidentId: "inc-low",
      incidentType: "performance",
      severity: "low",
      confidence: 0.5,
      requestedResources: { sre: RESOURCE_POOL.sre - 1, seceng: 0, dataeng: 0, ic: 0, compliance: 0 },
    });

    // Critical incident needs more SREs than remain free
    const result = rm.allocate({
      incidentId: "inc-critical",
      incidentType: "security",
      severity: "critical",
      confidence: 0.95,
      requestedResources: { sre: 4, seceng: 0, dataeng: 0, ic: 0, compliance: 0 },
    });

    expect(result.granted.sre).toBe(4);
    expect(result.reallocations.length).toBeGreaterThan(0);
    const realloc = result.reallocations[0];
    expect(realloc.fromIncidentId).toBe("inc-low");
    expect(realloc.type).toBe("sre");
    expect(realloc.count).toBe(3); // 1 free + 3 reclaimed = 4
    expect(realloc.remaining).toBe(RESOURCE_POOL.sre - 1 - 3);
  });

  it("denies what cannot be granted or reclaimed", () => {
    const result = rm.allocate({
      incidentId: "inc-greedy",
      incidentType: "outage",
      severity: "critical",
      confidence: 1,
      requestedResources: { sre: RESOURCE_POOL.sre + 5, seceng: 0, dataeng: 0, ic: 0, compliance: 0 },
    });
    expect(result.granted.sre).toBe(RESOURCE_POOL.sre);
    expect(result.denied.sre).toBe(5);
  });

  it("release() returns resources to the pool", () => {
    rm.allocate({
      incidentId: "inc-1",
      incidentType: "outage",
      severity: "high",
      confidence: 0.9,
      requestedResources: { sre: 5, seceng: 0, dataeng: 0, ic: 0, compliance: 0 },
    });
    rm.release("inc-1");
    const status = rm.getStatus();
    expect(status.available.sre).toBe(RESOURCE_POOL.sre);
    expect(status.activeIncidents).toHaveLength(0);
  });

  it("does not reclaim from equal- or higher-priority incidents", () => {
    rm.allocate({
      incidentId: "inc-critical-1",
      incidentType: "security",
      severity: "critical",
      confidence: 0.95,
      requestedResources: { sre: RESOURCE_POOL.sre, seceng: 0, dataeng: 0, ic: 0, compliance: 0 },
    });
    const result = rm.allocate({
      incidentId: "inc-critical-2",
      incidentType: "security",
      severity: "critical",
      confidence: 0.95,
      requestedResources: { sre: 2, seceng: 0, dataeng: 0, ic: 0, compliance: 0 },
    });
    expect(result.granted.sre).toBe(0);
    expect(result.denied.sre).toBe(2);
    expect(result.reallocations).toHaveLength(0);
  });
});
