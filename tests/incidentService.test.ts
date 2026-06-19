import { describe, it, expect, vi } from "vitest";

vi.mock("../src/services/incidentService.js", () => ({
  IncidentService: {
    verifyIncident: vi.fn().mockResolvedValue({ incidentId: "inc-1", status: "closed" }),
  },
}));

import { VerifyIncidentSchema } from "../src/lib/validationSchemas";

describe("incident route validation", () => {
  it("VerifyIncidentSchema rejects missing fields", () => {
    const bad = VerifyIncidentSchema.safeParse({ incidentId: "inc-1" });
    expect(bad.success).toBe(false);

    const good = VerifyIncidentSchema.safeParse({
      incidentId: "inc-1",
      status: "closed",
      fieldReport: "resolved on site",
    });
    expect(good.success).toBe(true);
  });
});
