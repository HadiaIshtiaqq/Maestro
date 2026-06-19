import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { operatorAuth } from "../src/middlewares/index";

vi.mock("../src/config/index.js", () => ({
  config: { operatorApiKey: "route-test-key", env: "test" },
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post("/api/admin/reset-demo", operatorAuth, (_req, res) => res.json({ ok: true }));
  app.post("/api/verify-status", operatorAuth, (_req, res) => res.json({ ok: true }));
  return app;
}

describe("route operator auth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks privileged routes without the operator key", async () => {
    const app = buildApp();
    const reset = await request(app).post("/api/admin/reset-demo").send({});
    expect(reset.status).toBe(401);

    const verify = await request(app).post("/api/verify-status").send({ incidentId: "x", status: "closed" });
    expect(verify.status).toBe(401);
  });

  it("allows privileged routes with a valid operator key", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/admin/reset-demo")
      .set("x-operator-key", "route-test-key")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
