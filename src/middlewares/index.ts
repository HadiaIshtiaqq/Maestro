import { Request, Response, NextFunction } from "express";
import admin from "firebase-admin";
import { config } from "../config/index.js";

// Initialize Firebase Admin if possible
if (config.firebase.projectId && config.firebase.clientEmail && config.firebase.privateKey) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebase.projectId,
      clientEmail: config.firebase.clientEmail,
      privateKey: config.firebase.privateKey,
    }),
  });
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split("Bearer ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    (req as any).user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ── Operator authorization ────────────────────────────────────────────────────
// Guards privileged routes: human approval gate, operator actions, demo seeding.
// Requires the x-operator-key header to match OPERATOR_API_KEY. When the env var
// is unset (local dev) requests pass through with a one-time warning so the demo
// stays runnable out of the box.

let warnedNoOperatorKey = false;

export function operatorAuth(req: Request, res: Response, next: NextFunction) {
  const requiredKey = process.env.OPERATOR_API_KEY;
  if (!requiredKey) {
    if (!warnedNoOperatorKey) {
      console.warn("[Auth] OPERATOR_API_KEY not set — operator routes are UNPROTECTED. Set it before hosting publicly.");
      warnedNoOperatorKey = true;
    }
    return next();
  }
  if (req.headers["x-operator-key"] === requiredKey) return next();
  return res.status(401).json({ error: "Operator authorization required" });
}

export function errorMiddleware(err: any, req: Request, res: Response, next: NextFunction) {
  console.error(err.stack);
  res.status(500).json({
    error: config.env === "production" ? "Internal Server Error" : err.message
  });
}
