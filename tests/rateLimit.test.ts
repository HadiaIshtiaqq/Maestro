import { describe, it, expect, vi, afterEach } from "vitest";
import { rateLimit } from "../src/middlewares/index";

function mockReqRes(ip = "1.2.3.4", path = "/ingest-signal") {
  const req: any = { ip, baseUrl: "/api", path };
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, any>,
    setHeader(k: string, v: any) { this.headers[k] = v; },
    status(code: number) { this.statusCode = code; return this; },
    body: undefined as any,
    json(b: any) { this.body = b; return this; },
  };
  const next = vi.fn();
  return { req, res, next };
}

afterEach(() => vi.useRealTimers());

describe("rateLimit middleware", () => {
  it("allows requests under the limit and blocks the excess with 429", () => {
    const mw = rateLimit(3);
    const { req, res, next } = mockReqRes();

    for (let i = 0; i < 3; i++) mw(req, res, next);
    expect(next).toHaveBeenCalledTimes(3);

    mw(req, res, next);
    expect(next).toHaveBeenCalledTimes(3); // not called again
    expect(res.statusCode).toBe(429);
    expect(res.headers["Retry-After"]).toBeGreaterThan(0);
  });

  it("tracks IPs independently", () => {
    const mw = rateLimit(1);
    const a = mockReqRes("1.1.1.1");
    const b = mockReqRes("2.2.2.2");

    mw(a.req, a.res, a.next);
    mw(b.req, b.res, b.next);
    expect(a.next).toHaveBeenCalledTimes(1);
    expect(b.next).toHaveBeenCalledTimes(1);
  });

  it("resets after the window elapses", () => {
    vi.useFakeTimers();
    const mw = rateLimit(1);
    const { req, res, next } = mockReqRes();

    mw(req, res, next);
    mw(req, res, next);
    expect(res.statusCode).toBe(429);

    vi.advanceTimersByTime(61_000);
    const fresh = mockReqRes();
    mw(fresh.req, fresh.res, fresh.next);
    expect(fresh.next).toHaveBeenCalledTimes(1);
  });
});
