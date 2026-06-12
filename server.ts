import express from "express";
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
import { startLiveDataPolling } from "./src/services/realDataService";
import { startAutonomousActions, registerBroadcast } from "./src/services/autonomousActions";
import { startEscalationService } from "./src/services/escalationService";
import { bandAdapter } from "./src/band/adapter";
import { seedDemoIncidents } from "./src/scripts/seedDemoData";

async function startServer() {
  const app    = express();
  const server = http.createServer(app);
  const io     = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  // ── Middleware ─────────────────────────────────────────────────────────────
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(morgan("dev"));
  app.use(express.json({ limit: '15mb' }));

  // ── MongoDB ────────────────────────────────────────────────────────────────
  try {
    await mongoose.connect(config.mongodb.uri, {
      serverSelectionTimeoutMS: 30000,
    });
    console.log("[MongoDB] Connected to", config.mongodb.uri);
    // Auto-seed demo data if the DB is empty
    await seedDemoIncidents();
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
          ts: new Date(m.ts ?? Date.now()).toISOString(),
        })),
      );
    } catch (err: any) {
      console.warn("[Band] Room hydration failed:", err.message);
    }
  }

  // ── Live Data Polling (GDACS + USGS + Open-Meteo) ─────────────────────────
  startLiveDataPolling();

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
