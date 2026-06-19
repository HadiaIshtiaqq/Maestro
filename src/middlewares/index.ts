import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { isOperatorKeyValid } from "../lib/authUtils.js";

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

// ── JWT authorization (mobile users) ─────────────────────────────────────────

export function jwtAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const decoded = jwt.verify(header.slice(7), config.jwtSecret) as { sub: string };
    req.userId = decoded.sub;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ── Operator authorization ────────────────────────────────────────────────────
// Guards privileged routes: human approval gate, operator actions, demo seeding.
// Requires the x-operator-key header to match OPERATOR_API_KEY. In production
// the key is mandatory (server refuses to boot without it). In development an
// unset key logs a one-time warning and allows access for local demos.

let warnedNoOperatorKey = false;

export function operatorAuth(req: Request, res: Response, next: NextFunction) {
  const requiredKey = config.operatorApiKey;
  if (!requiredKey) {
    if (!warnedNoOperatorKey) {
      console.warn("[Auth] OPERATOR_API_KEY not set — operator routes are UNPROTECTED (dev only).");
      warnedNoOperatorKey = true;
    }
    return next();
  }
  const provided = req.headers["x-operator-key"];
  if (typeof provided === "string" && isOperatorKeyValid(provided, requiredKey)) {
    return next();
  }
  return res.status(401).json({ error: "Operator authorization required" });
}

/** Validate operator key from Socket.IO handshake auth payload. */
export function isValidSocketAuth(auth: { operatorKey?: string; token?: string } | undefined): boolean {
  if (!config.operatorApiKey) return true; // dev: open sockets
  if (auth?.operatorKey && isOperatorKeyValid(auth.operatorKey, config.operatorApiKey)) return true;
  if (auth?.token) {
    try {
      jwt.verify(auth.token, config.jwtSecret);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

export function rateLimit(maxPerMinute: number) {
  const hits = new Map<string, { count: number; windowStart: number }>();
  const WINDOW_MS = 60_000;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now - entry.windowStart >= WINDOW_MS) {
      hits.set(key, { count: 1, windowStart: now });
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (now - v.windowStart >= WINDOW_MS) hits.delete(k);
      }
      return next();
    }

    entry.count += 1;
    if (entry.count > maxPerMinute) {
      res.setHeader("Retry-After", Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000));
      return res.status(429).json({ error: `Rate limit exceeded — max ${maxPerMinute} requests/minute` });
    }
    next();
  };
}

export function errorMiddleware(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(err.stack);
  res.status(500).json({
    error: config.env === "production" ? "Internal Server Error" : err.message,
  });
}
