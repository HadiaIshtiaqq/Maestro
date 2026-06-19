import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../src/band/adapter.js", () => ({
  bandAdapter: { post: vi.fn().mockResolvedValue({ id: "msg-1" }) },
}));

vi.mock("../src/models/index.js", () => ({
  Approval: {
    create: vi.fn().mockResolvedValue({ approval_id: "a1" }),
    findOne: vi.fn().mockResolvedValue(null),
  },
  Incident: {
    findOneAndUpdate: vi.fn().mockResolvedValue({ incidentId: "inc-1" }),
  },
}));

vi.mock("../src/events/eventBus.js", () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock("mongoose", () => ({
  default: { connection: { readyState: 0 } },
}));

import {
  createApprovalGate,
  submitDecision,
  getPendingApprovals,
  isPending,
} from "../src/services/approvalService";

describe("approvalService", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it("tracks pending gates and resolves on submitDecision", async () => {
    const gatePromise = createApprovalGate("prop-1", "room-1", "inc-1");
    expect(getPendingApprovals()).toHaveLength(1);
    expect(isPending("prop-1")).toBe(true);

    const result = await submitDecision("prop-1", "approved", "human-commander", "ok");
    expect(result.ok).toBe(true);
    expect(await gatePromise).toBe("approved");
    expect(isPending("prop-1")).toBe(false);
  });

  it("auto-vetoes after the 5-minute timeout", async () => {
    vi.useFakeTimers();
    const gatePromise = createApprovalGate("prop-timeout", "room-2", "inc-2");
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await expect(gatePromise).resolves.toBe("vetoed");
    expect(isPending("prop-timeout")).toBe(false);
  });

  it("returns an error when submitting against an unknown proposal", async () => {
    const result = await submitDecision("missing", "approved", "human-commander");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No pending approval/);
  });
});
