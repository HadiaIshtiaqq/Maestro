import { describe, it, expect, vi, beforeEach } from "vitest";
import { operatorAuth } from "../src/middlewares/index";

vi.mock("../src/config/index.js", () => ({
  config: { operatorApiKey: "test-operator-key", env: "test" },
}));

function mockReqRes(headers: Record<string, string> = {}) {
  const req: any = { headers };
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  const next = vi.fn();
  return { req, res, next };
}

describe("operatorAuth middleware", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows requests with a matching x-operator-key header", () => {
    const { req, res, next } = mockReqRes({ "x-operator-key": "test-operator-key" });
    operatorAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it("rejects requests with a missing or wrong key", () => {
    const missing = mockReqRes();
    operatorAuth(missing.req, missing.res, missing.next);
    expect(missing.next).not.toHaveBeenCalled();
    expect(missing.res.statusCode).toBe(401);

    const wrong = mockReqRes({ "x-operator-key": "wrong" });
    operatorAuth(wrong.req, wrong.res, wrong.next);
    expect(wrong.res.statusCode).toBe(401);
  });
});
