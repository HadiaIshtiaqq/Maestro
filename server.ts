import express from "express";
import dns from "dns";
import path from "path";
import { createServer as createViteServer } from "vite";
import http from "http";
import { Server } from "socket.io";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import mongoose from "mongoose";
import { config } from "./src/config/index";
import routes from "./src/routes/index";
import userRoutes from "./src/routes/users";
import { setupSocketHandlers } from "./src/events/socketHandlers";
import { errorMiddleware } from "./src/middlewares/index";
import { startLiveDataPolling } from "./src/services/realDataService";
import { startAutonomousActions, registerBroadcast } from "./src/services/autonomousActions";
import { startEscalationService } from "./src/services/escalationService";
import { bandAdapter } from "./src/band/adapter";
import { seedDemoIncidents } from "./src/scripts/seedDemoData";

async function startServer() {
  // CORS_ORIGIN: comma-separated allowlist; unset = open (warn in production)
  const corsOrigin: string | string[] =
    process.env.CORS_ORIGIN?.split(",").map(s => s.trim()).filter(Boolean) ?? "*";
  if (corsOrigin === "*" && config.env === "production") {
    console.warn("[CORS] CORS_ORIGIN not set — all origins allowed. Set it for public hosting.");
  }

  const app    = express();
  const server = http.createServer(app);
  const io     = new Server(server, {
    cors: { origin: corsOrigin, methods: ["GET", "POST"] },
  });

  // ── Middleware ─────────────────────────────────────────────────────────────
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: corsOrigin }));
  app.use(morgan("dev"));
  app.use(express.json({ limit: '15mb' }));

  // ── MongoDB ────────────────────────────────────────────────────────────────
  // Atlas SRV lookups fail on some local DNS resolvers — DNS_SERVERS overrides.
  if (config.mongodb.dnsServers.length > 0) {
    dns.setServers(config.mongodb.dnsServers);
    console.log("[DNS] Using resolvers:", config.mongodb.dnsServers.join(", "));
  }
  try {
    await mongoose.connect(config.mongodb.uri, {
      serverSelectionTimeoutMS: 30000,
    });
    console.log("[MongoDB] Connected to", config.mongodb.uri);
    // Auto-seed demo data if the DB is empty (never silently in production)
    if (config.env !== "production" || process.env.SEED_DEMO === "true") {
      await seedDemoIncidents();
    }
  } catch (err) {
    console.warn("[MongoDB] Connection failed — running without persistence:", err);
  }

  // ── API Routes ─────────────────────────────────────────────────────────────
  app.use("/api", routes);
  app.use("/api/users", userRoutes);

  app.get("/api/health", (req, res) => {
    res.json({
      status:    "ok",
      timestamp: new Date().toISOString(),
      mongo:     mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    });
  });

  // Error handler for uncaught route errors (was defined but never mounted)
  app.use(errorMiddleware);

  // ── Socket.IO (wires eventBus → broadcasts) ────────────────────────────────
  setupSocketHandlers(io);

  // ── Autonomous Actions Engine ──────────────────────────────────────────────
  registerBroadcast((event, data) => io.emit(event, data));
  startAutonomousActions();

  // ── Band Adapter: wire Socket.IO broadcast + rehydrate rooms after restart ─
  bandAdapter.setBroadcast((event, data) => io.emit(event, data));
  if (mongoose.connection.readyState === 1) {
    try {
      const { BandRoom, AgentMessage } = await import("./src/models/index");
      const [rooms, messages] = await Promise.all([
        BandRoom.find().lean(),
        AgentMessage.find().sort({ ts: 1 }).lean(),
      ]);
      bandAdapter.hydrate(
        rooms.map((r: any) => ({
          room_id:      r.room_id,
          incident_id:  r.incident_id,
          participants: r.participants ?? [],
          created_at:   new Date(r.created_at ?? Date.now()).toISOString(),
          status:       r.status ?? 'open',
        })),
        messages.map((m: any) => ({
          id: m.id, msg_type: m.msg_type, from_agent: m.from_agent,
          incident_id: m.incident_id, room_id: m.room_id, step: m.step,
          payload: m.payload, confidence: m.confidence,
          requires_human_approval: m.requires_human_approval,
          engine: m.engine,
          ts: new Date(m.ts ?? Date.now()).toISOString(),
        })),
      );
    } catch (err: any) {
      console.warn("[Band] Room hydration failed:", err.message);
    }

    // Approval gates are in-memory promises and do not survive restarts.
    // Orphaned pending approvals are auto-vetoed (same safety policy as the
    // 5-minute timeout) so incidents never hang in limbo after a redeploy.
    try {
      const { Incident } = await import("./src/models/index");
      const { resourceManager } = await import("./src/services/resourceManager");
      const orphaned = await Incident.find({ pendingApprovalId: { $ne: null } });
      for (const inc of orphaned) {
        await Incident.findOneAndUpdate(
          { incidentId: inc.incidentId },
          { $set: { status: "retracted", pendingApprovalId: null, "metadata.orphanedApprovalVetoedAt": new Date() } }
        );
        resourceManager.release(inc.incidentId);
        if (inc.roomId) {
          await bandAdapter.post(inc.roomId, {
            msg_type:                "retraction",
            from_agent:              "incident-commander",
            incident_id:             inc.incidentId,
            step:                    "orphaned-approval-veto",
            payload:                 { reason: "Server restarted while approval was pending — auto-vetoed for safety" },
            confidence:              1.0,
            requires_human_approval: false,
          }).catch(() => {});
        }
        console.warn(`[Approval] Orphaned pending approval on ${inc.incidentId} auto-vetoed after restart`);
      }
    } catch (err: any) {
      console.warn("[Approval] Orphan sweep failed:", err.message);
    }
  }

  // ── Live Data Polling (GDACS + USGS + Open-Meteo) ─────────────────────────
  // Opt-in: every external event runs the full LLM pipeline and creates real
  // incidents — keep it off during demos unless explicitly wanted.
  if (process.env.LIVE_DATA_POLLING === "true") {
    startLiveDataPolling();
  } else {
    console.log("[RealData] Live polling disabled (set LIVE_DATA_POLLING=true to enable)");
  }

  // ── Escalation Service (auto-escalate stuck incidents) ────────────────────
  startEscalationService();

  // ── Vite (dev) or static (prod) ────────────────────────────────────────────
  if (config.env !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(config.port, "0.0.0.0", () => {
    console.log(`[NEXUS] Server running on http://localhost:${config.port} [${config.env}]`);
  });
}

startServer().catch(err => {
  console.error("[NEXUS] Failed to start server:", err);
  process.exit(1);
});
