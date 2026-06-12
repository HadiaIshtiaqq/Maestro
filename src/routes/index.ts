import { Router } from "express";
import { IncidentService } from "../services/incidentService";
import { seedDemoIncidents } from "../scripts/seedDemoData";
import { nexusOrchestrator } from "../agents/ciroAgents";
import { resourceManager } from "../services/resourceManager";
import { ActionSimulator } from "../simulations/actionSimulator";
import { fetchAllLiveData, fetchGDACS, fetchKarachiWeather, fetchUSGSEarthquakes } from "../services/realDataService";
import { getRecentAutonomousActions } from "../services/autonomousActions";
import { getGeminiCacheStats, chatIncidentIntake, askGemini } from "../services/geminiService";
import { Incident, DispatchLog, AgentMessage, BandRoom as BandRoomModel, Approval } from "../models/index";
import { eventBus } from "../events/eventBus";
import { bandAdapter } from "../band/adapter";
import { submitDecision, getPendingApprovals } from "../services/approvalService";
import { operatorAuth } from "../middlewares/index";
import { z } from "zod";

const router = Router();

// ── Ingest validation ─────────────────────────────────────────────────────────
const IngestSignalSchema = z.object({
  source:   z.string().min(1).max(50).default("social"),
  type:     z.string().min(1).max(200),
  data:     z.record(z.string(), z.any()).default({}),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
  urgency:  z.number().min(0).max(10).optional(),
}).passthrough();

// Privileged routes: operator actions + human approval gate + demo seeding
router.use("/operator", operatorAuth);
router.use("/band/approve", operatorAuth);
router.use("/band/veto", operatorAuth);
router.use("/seed-demo", operatorAuth);

// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL ROUTES
// ─────────────────────────────────────────────────────────────────────────────

router.post("/signals/:source", async (req, res) => {
  try {
    const { source } = req.params;
    const result = await IncidentService.processNewSignal({
      ...req.body,
      source: source as any,
      timestamp: new Date(),
    });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/ingest-signal", async (req, res) => {
  try {
    const parsed = IngestSignalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid signal payload", issues: parsed.error.issues });
    }
    const { source, location, ...rest } = parsed.data;

    if (source === "call" && rest.type === "manual_report") {
      const result = await IncidentService.processManualReport(
        { ...rest, source: source as any, timestamp: new Date() },
        location ?? undefined
      );
      return res.status(201).json(result);
    }

    const result = await IncidentService.processNewSignal({
      ...rest,
      source: source as any,
      timestamp: new Date(),
    });
    res.status(201).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// INCIDENT ROUTES
// ─────────────────────────────────────────────────────────────────────────────

router.get("/incidents", async (req, res) => {
  try {
    const incidents = await IncidentService.getIncidents();
    res.json(incidents);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/incidents/history
 * Returns closed and retracted incidents with pagination.
 * Query: ?limit=50&page=1&severity=critical
 */
router.get("/incidents/history", async (req, res) => {
  try {
    const limit    = Math.min(parseInt(req.query.limit  as string || "50"), 200);
    const page     = Math.max(parseInt(req.query.page   as string || "1"),  1);
    const severity = req.query.severity as string | undefined;
    const type     = req.query.type     as string | undefined;

    const filter: any = { status: { $in: ["closed", "retracted"] } };
    if (severity) filter.severity = severity;
    if (type)     filter.type     = new RegExp(type, "i");

    const [incidents, total] = await Promise.all([
      Incident.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("-traceLog -signals"),
      Incident.countDocuments(filter),
    ]);

    res.json({ incidents, total, page, pages: Math.ceil(total / limit) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/incidents/:id", async (req, res) => {
  try {
    const incident = await IncidentService.getIncidentById(req.params.id);
    if (!incident) return res.status(404).json({ error: "Incident not found" });
    res.json(incident);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/incidents/verify", async (req, res) => {
  try {
    const { incidentId, status, fieldReport } = req.body;
    const result = await IncidentService.verifyIncident(incidentId, status, fieldReport);
    if (!result) return res.status(404).json({ error: "Incident not found" });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/seed-demo", async (_req, res) => {
  try {
    // Force re-seed by clearing existing demo incidents first
    const { Incident: Inc } = await import("../models/index");
    await Inc.deleteMany({ incidentId: { $regex: /^demo-/ } });
    await seedDemoIncidents();
    const data = await IncidentService.getActiveCrisesWithResources();
    res.json({ ok: true, seeded: data.incidents.length, incidents: data.incidents });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/active-crises", async (req, res) => {
  try {
    const data = await IncidentService.getActiveCrisesWithResources();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/verify-status", async (req, res) => {
  try {
    const { incidentId, status, fieldReport } = req.body;
    if (!incidentId || !status) {
      return res.status(400).json({ error: "incidentId and status are required" });
    }
    const result = await IncidentService.verifyIncident(incidentId, status, fieldReport);
    if (!result) return res.status(404).json({ error: "Incident not found" });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// INCIDENT INTAKE CHATBOT
// ─────────────────────────────────────────────────────────────────────────────

router.post("/chat/incident", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }
    const result = await chatIncidentIntake(messages);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VOICE TRANSCRIPTION (Gemini multimodal)
// ─────────────────────────────────────────────────────────────────────────────

router.post("/voice-transcribe", async (req, res) => {
  try {
    const { audioBase64, mimeType = "audio/mp4" } = req.body;
    if (!audioBase64) return res.status(400).json({ error: "audioBase64 required" });
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent([
      { inlineData: { mimeType, data: audioBase64 } },
      "Transcribe this emergency incident audio report accurately. Return ONLY the spoken words. If no speech is detected, return 'No speech detected.'",
    ]);
    res.json({ text: result.response.text().trim() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/stats/dashboard
 * Returns real-time summary counters for the ECC top bar and dashboards.
 */
router.get("/stats/dashboard", async (req, res) => {
  try {
    const [active, critical, resolved, retracted] = await Promise.all([
      Incident.countDocuments({ status: { $nin: ["closed", "retracted"] } }),
      Incident.countDocuments({ severity: "critical", status: { $nin: ["closed", "retracted"] } }),
      Incident.countDocuments({ status: "closed" }),
      Incident.countDocuments({ status: "retracted" }),
    ]);

    // Severity breakdown for active incidents
    const severityBreakdown = await Incident.aggregate([
      { $match: { status: { $nin: ["closed", "retracted"] } } },
      { $group: { _id: "$severity", count: { $sum: 1 } } },
    ]);

    // Type breakdown (top 5 types)
    const typeBreakdown = await Incident.aggregate([
      { $match: { status: { $nin: ["closed", "retracted"] } } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    // Average confidence of active incidents
    const avgConf = await Incident.aggregate([
      { $match: { status: { $nin: ["closed", "retracted"] } } },
      { $group: { _id: null, avg: { $avg: "$confidence" } } },
    ]);

    // Incidents created in last 24 hours
    const since24h = await Incident.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const resources = resourceManager.getStatus();
    const pool      = (resources.pool      ?? {}) as Record<string, number>;
    const avail     = (resources.available ?? {}) as Record<string, number>;
    const totalPool     = Object.values(pool).reduce((s, v) => s + v, 0) as number;
    const totalDeployed = Object.keys(pool).reduce(
      (s, k) => s + (pool[k] - (avail[k] ?? 0)), 0
    ) as number;
    const operatorLoad = totalPool > 0 ? Math.round((totalDeployed / totalPool) * 100) : 0;

    res.json({
      active,
      critical,
      resolved,
      retracted,
      since24h,
      operatorLoad,
      avgConfidence: avgConf[0]?.avg ?? 0,
      severityBreakdown: Object.fromEntries(severityBreakdown.map(s => [s._id, s.count])),
      typeBreakdown:     typeBreakdown.map(t => ({ type: t._id, count: t.count })),
      resources: {
        pool:        resources.pool,
        available:   resources.available,
        deployed:    resources.deployed,
        utilization: resources.utilizationPct,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stats/timeline
 * Returns incident counts grouped by hour for the last 24 hours.
 */
router.get("/stats/timeline", async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const timeline = await Incident.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: {
            hour:     { $hour:       "$createdAt" },
            severity: "$severity",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.hour": 1 } },
    ]);
    res.json({ timeline, since: since.toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// RESOURCE ROUTES
// ─────────────────────────────────────────────────────────────────────────────

router.get("/resources/status", (req, res) => {
  res.json(resourceManager.getStatus());
});

/**
 * GET /api/resources/forecast
 * Returns a simple forecast: if current trend continues, when will each
 * resource type be fully depleted? Based on current utilisation rate.
 */
router.get("/resources/forecast", async (req, res) => {
  try {
    const status    = resourceManager.getStatus();
    const pool      = status.pool      as Record<string, number>;
    const available = status.available as Record<string, number>;

    const forecast = Object.entries(pool).map(([type, total]) => {
      const avail    = available[type] ?? 0;
      const deployed = total - avail;
      const pct      = total > 0 ? (deployed / total) * 100 : 0;
      return {
        type,
        total,
        deployed,
        available: avail,
        utilizationPct: Math.round(pct),
        status: pct >= 100 ? "depleted" : pct >= 80 ? "critical" : pct >= 50 ? "moderate" : "available",
      };
    });

    res.json({ forecast, generatedAt: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OPERATOR ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/operator/takeover
 * Assigns manual operator control to an incident.
 * Uses dot-notation $set to preserve existing metadata fields.
 */
router.post("/operator/takeover", async (req, res) => {
  try {
    const { incidentId, operatorId } = req.body;
    if (!incidentId) return res.status(400).json({ error: "incidentId required" });

    const inc = await Incident.findOneAndUpdate(
      { incidentId },
      {
        $set: {
          status:                     "active",
          "metadata.operatorControl": true,
          "metadata.takenOverAt":     new Date(),
          "metadata.takenOverBy":     operatorId ?? "operator",
        },
      },
      { new: true },
    );
    if (!inc) return res.status(404).json({ error: "Incident not found" });

    eventBus.emit("incident:updated", { incident: inc });
    res.json({ ok: true, incident: inc });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * POST /api/operator/resolve
 * Closes an incident and releases its allocated resources.
 */
router.post("/operator/resolve", async (req, res) => {
  try {
    const { incidentId, notes, operatorId } = req.body;
    if (!incidentId) return res.status(400).json({ error: "incidentId required" });

    const inc = await Incident.findOneAndUpdate(
      { incidentId },
      {
        $set: {
          status:                   "closed",
          "metadata.resolvedAt":    new Date(),
          "metadata.resolvedBy":    operatorId ?? "operator",
          "metadata.operatorNotes": notes ?? "",
        },
      },
      { new: true },
    );
    if (!inc) return res.status(404).json({ error: "Incident not found" });

    resourceManager.release(incidentId);
    eventBus.emit("incident:updated", { incident: inc });
    eventBus.emit("resources:updated", resourceManager.getStatus());
    res.json({ ok: true, incident: inc });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * POST /api/operator/notes
 * Appends a note to an incident without changing its status.
 */
router.post("/operator/notes", async (req, res) => {
  try {
    const { incidentId, note, operatorId } = req.body;
    if (!incidentId || !note) return res.status(400).json({ error: "incidentId and note required" });

    const inc = await Incident.findOneAndUpdate(
      { incidentId },
      {
        $push: {
          "metadata.notes": {
            text:      note,
            addedBy:   operatorId ?? "operator",
            addedAt:   new Date(),
          },
        },
      },
      { new: true },
    );
    if (!inc) return res.status(404).json({ error: "Incident not found" });
    eventBus.emit("incident:updated", { incident: inc });
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * POST /api/operator/escalate
 * Manually escalates an incident's severity or status.
 */
router.post("/operator/escalate", async (req, res) => {
  try {
    const { incidentId, severity, status, reason, operatorId } = req.body;
    if (!incidentId) return res.status(400).json({ error: "incidentId required" });

    const updates: any = { $set: {} };
    if (severity) updates.$set.severity = severity;
    if (status)   updates.$set.status   = status;
    updates.$set["metadata.escalatedAt"]  = new Date();
    updates.$set["metadata.escalatedBy"]  = operatorId ?? "operator";
    updates.$set["metadata.escalationReason"] = reason ?? "Manual escalation";

    const inc = await Incident.findOneAndUpdate({ incidentId }, updates, { new: true });
    if (!inc) return res.status(404).json({ error: "Incident not found" });

    eventBus.emit("incident:updated", { incident: inc });
    res.json({ ok: true, incident: inc });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * POST /api/operator/bulk-close
 * Closes multiple incidents at once.
 * Body: { incidentIds: string[], reason?: string }
 */
router.post("/operator/bulk-close", async (req, res) => {
  try {
    const { incidentIds, reason, operatorId } = req.body;
    if (!Array.isArray(incidentIds) || incidentIds.length === 0) {
      return res.status(400).json({ error: "incidentIds array required" });
    }

    const results: { incidentId: string; ok: boolean; error?: string }[] = [];

    for (const incidentId of incidentIds) {
      try {
        const inc = await Incident.findOneAndUpdate(
          { incidentId, status: { $nin: ["closed", "retracted"] } },
          {
            $set: {
              status:                   "closed",
              "metadata.resolvedAt":    new Date(),
              "metadata.resolvedBy":    operatorId ?? "operator",
              "metadata.bulkCloseNote": reason ?? "Bulk close",
            },
          },
          { new: true },
        );
        if (inc) {
          resourceManager.release(incidentId);
          eventBus.emit("incident:updated", { incident: inc });
          results.push({ incidentId, ok: true });
        } else {
          results.push({ incidentId, ok: false, error: "Not found or already closed" });
        }
      } catch (err: any) {
        results.push({ incidentId, ok: false, error: err.message });
      }
    }

    eventBus.emit("resources:updated", resourceManager.getStatus());
    res.json({ results, closed: results.filter(r => r.ok).length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCH LOG ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/dispatch-log
 * Record a manual dispatch action (SMS/WhatsApp/call sent to a service).
 */
router.post("/dispatch-log", async (req, res) => {
  try {
    const { incidentId, service, message, sentBy, channel } = req.body;
    if (!incidentId || !service || !message) {
      return res.status(400).json({ error: "incidentId, service, and message required" });
    }
    const log = await DispatchLog.create({
      incidentId,
      service:  service  ?? "other",
      message,
      sentBy:   sentBy   ?? "operator",
      channel:  channel  ?? "sms",
      status:   "sent",
      sentAt:   new Date(),
    });
    res.status(201).json({ ok: true, log });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * GET /api/dispatch-log/:incidentId
 * Returns all dispatch records for a given incident.
 */
router.get("/dispatch-log/:incidentId", async (req, res) => {
  try {
    const logs = await DispatchLog.find({ incidentId: req.params.incidentId }).sort({ sentAt: -1 });
    res.json({ count: logs.length, logs });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * PATCH /api/dispatch-log/:logId/acknowledge
 * Mark a dispatch as acknowledged by the receiving unit.
 */
router.patch("/dispatch-log/:logId/acknowledge", async (req, res) => {
  try {
    const log = await DispatchLog.findByIdAndUpdate(
      req.params.logId,
      { status: "acknowledged", acknowledgedAt: new Date() },
      { new: true },
    );
    if (!log) return res.status(404).json({ error: "Dispatch log not found" });
    res.json({ ok: true, log });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// SIMULATION ROUTES
// ─────────────────────────────────────────────────────────────────────────────

router.post("/simulate/action", async (req, res) => {
  try {
    const result = await ActionSimulator.simulate(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/simulate/impact", async (req, res) => {
  try {
    const result = await ActionSimulator.simulateImpact(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/simulate/false-positive", async (req, res) => {
  try {
    const result = await ActionSimulator.simulateFalsePositiveRecovery(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/simulate/stress-test", async (req, res) => {
  try {
    const sector = req.body.sector ?? { A: { lat: 24.8607, lng: 67.0011 }, B: { lat: 24.9056, lng: 67.0822 } };

    const [floodResult, heatwaveResult] = await Promise.all([
      IncidentService.processNewSignal({
        source:    "weather",
        type:      "flood_alert",
        data:      { rainfall_mm: 75, duration_hrs: 1.5, drain_capacity: "overwhelmed", description: "Flash flood — Sector A downtown" },
        location:  sector.A,
        urgency:   9,
        timestamp: new Date(),
      }),
      IncidentService.processNewSignal({
        source:    "sensor",
        type:      "heatwave_alert",
        data:      { temperature_c: 47, humidity_pct: 15, heat_index: "extreme", description: "Heatwave emergency — Sector B residential" },
        location:  sector.B,
        urgency:   8,
        timestamp: new Date(),
      }),
    ]);

    res.json({
      scenario:  "Simultaneous Flood (Sector A) + Heatwave (Sector B)",
      startedAt: new Date().toISOString(),
      results: {
        floodIncident:    floodResult,
        heatwaveIncident: heatwaveResult,
      },
      resourceContention: resourceManager.getStatus(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/simulate/disaster", async (req, res) => {
  try {
    const center = req.body.center ?? { lat: 33.6844, lng: 73.0479 };
    const [r1, r2, r3] = await Promise.all([
      IncidentService.processNewSignal({ source: "sensor",  type: "building_collapse", data: { casualties_est: 45, structure: "commercial", description: "Multi-storey collapse — Disaster scenario" }, location: center, urgency: 10, timestamp: new Date() }),
      IncidentService.processNewSignal({ source: "weather", type: "flood_alert",       data: { rainfall_mm: 90, description: "Flash flood triggered by disaster" }, location: { lat: center.lat + 0.01, lng: center.lng + 0.01 }, urgency: 9, timestamp: new Date() }),
      IncidentService.processNewSignal({ source: "social",  type: "fire_emergency",    data: { spread_rate: "rapid", description: "Post-collapse fire" }, location: { lat: center.lat - 0.01, lng: center.lng - 0.01 }, urgency: 9, timestamp: new Date() }),
    ]);
    res.json({ scenario: "DISASTER — Mass Casualty Event", incidents: [r1, r2, r3], resources: resourceManager.getStatus() });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/simulate/world-cup", async (req, res) => {
  try {
    const venue = req.body.venue ?? { lat: 33.7294, lng: 73.0931 };
    const [r1, r2] = await Promise.all([
      IncidentService.processNewSignal({ source: "social", type: "crowd_surge", data: { crowd_est: 80000, density: "critical", description: "Crowd crush near stadium gates — World Cup mode" }, location: venue, urgency: 9, timestamp: new Date() }),
      IncidentService.processNewSignal({ source: "sensor", type: "medical_emergency", data: { patients_est: 20, triage_level: "mass_casualty", description: "Medical emergency — stadium crowd" }, location: { lat: venue.lat + 0.005, lng: venue.lng }, urgency: 8, timestamp: new Date() }),
    ]);
    res.json({ scenario: "WORLD CUP — Crowd Surge Event", incidents: [r1, r2], resources: resourceManager.getStatus() });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// AGENT / TRACE ROUTES
// ─────────────────────────────────────────────────────────────────────────────

router.get("/agents/status", async (req, res) => {
  const traces    = nexusOrchestrator.getAllTraces();
  const persisted = await nexusOrchestrator.getPersistedTraces(5).catch(() => []);
  res.json({
    status:          "all agents operational",
    agentCount:      11,
    activeTraces:    traces.filter(t => t.status === "running").length,
    totalTraces:     traces.length,
    persistedTraces: persisted.length,
    geminiCache:     getGeminiCacheStats(),
  });
});

router.get("/traces/all", async (req, res) => {
  try {
    const limit  = parseInt(req.query.limit as string || "50");
    const traces = await nexusOrchestrator.getPersistedTraces(limit);
    res.json({ count: traces.length, traces });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/traces/:taskId", (req, res) => {
  const trace = nexusOrchestrator.getTrace(req.params.taskId);
  if (!trace) return res.status(404).json({ error: "Trace not found" });
  res.json(trace);
});

// ─────────────────────────────────────────────────────────────────────────────
// LIVE DATA ROUTES
// ─────────────────────────────────────────────────────────────────────────────

router.post("/live-feed", async (req, res) => {
  try {
    const result = await fetchAllLiveData();
    res.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/live-feed/gdacs", async (req, res) => {
  try {
    const events = await fetchGDACS();
    res.json({ count: events.length, events });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/live-feed/weather", async (req, res) => {
  try {
    const url  = `https://api.open-meteo.com/v1/forecast?latitude=33.6844&longitude=73.0479&current=temperature_2m,precipitation,windspeed_10m,weathercode&timezone=Asia%2FKarachi`;
    const data = await fetch(url).then(r => r.json());
    res.json({ source: "open-meteo", location: "Islamabad, Pakistan", ...data.current });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/autonomous-actions", async (req, res) => {
  try {
    const limit   = parseInt(req.query.limit as string || "20");
    const actions = await getRecentAutonomousActions(limit);
    res.json({ count: actions.length, actions });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// LIVE CONTEXT  (weather / traffic / social for Signal Input tabs)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/data/live-context", async (req, res) => {
  const type = (req.query.type as string) ?? "";

  if (type === "weather") {
    try {
      // Open-Meteo — free, no key, Karachi coordinates
      const url = "https://api.open-meteo.com/v1/forecast?latitude=24.8607&longitude=67.0011&current=temperature_2m,apparent_temperature,precipitation,weathercode,windspeed_10m,winddirection_10m,relativehumidity_2m,uv_index&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FKarachi&forecast_days=1";
      const data: any = await fetch(url).then(r => r.json());
      const c = data.current ?? {};
      const d = data.daily ?? {};
      const WMO: Record<number, string> = {
        0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",
        45:"Foggy",48:"Icy fog",51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",
        61:"Light rain",63:"Rain",65:"Heavy rain",71:"Light snow",73:"Snow",75:"Heavy snow",
        80:"Light showers",81:"Showers",82:"Heavy showers",95:"Thunderstorm",96:"Thunderstorm+hail",99:"Thunderstorm+heavy hail",
      };
      const condition = WMO[c.weathercode] ?? `Code ${c.weathercode}`;
      const lines = [
        `🌤 Karachi Weather — Live (Open-Meteo)`,
        `Condition: ${condition}`,
        `Temperature: ${c.temperature_2m}°C (Feels like ${c.apparent_temperature}°C)`,
        `Humidity: ${c.relativehumidity_2m}%  ·  Wind: ${c.windspeed_10m} km/h`,
        `Precipitation: ${c.precipitation} mm  ·  UV Index: ${c.uv_index ?? "N/A"}`,
        d.temperature_2m_max?.[0] != null
          ? `Today: High ${d.temperature_2m_max[0]}°C / Low ${d.temperature_2m_min[0]}°C · Rain ${d.precipitation_sum[0]} mm`
          : "",
      ].filter(Boolean).join("\n");
      return res.json({ summary: lines });
    } catch (e: any) {
      return res.json({ summary: "Weather data unavailable — enter conditions manually.\n(Open-Meteo API error)" });
    }
  }

  if (type === "traffic") {
    const now   = new Date();
    const pktH  = (now.getUTCHours() + 5) % 24;
    const period = pktH >= 7 && pktH <= 10 ? "morning rush hour (7–10 AM PKT)"
                 : pktH >= 17 && pktH <= 20 ? "evening rush hour (5–8 PM PKT)"
                 : `off-peak hours (${pktH}:00 PKT)`;
    const prompt = `You are a Karachi traffic intelligence system. Generate a 4-sentence real-time traffic signal report for Karachi, Pakistan during ${period}.
Cover: Shahrah-e-Faisal, University Road, M-9 Motorway, Clifton Bridge, Numaish/Saddar interchange.
For each road mention: congestion level (clear/slow/congested), estimated delay, and any incidents (accidents, protests, construction).
End with a recommended alternate route. Be specific, operational, realistic. No markdown.`;
    try {
      const text = await askGemini(prompt, false);
      return res.json({ simulated: true, summary: `🚦 [SIMULATED — AI-generated demo data] Traffic Intelligence — ${period}\n\n${text}` });
    } catch {
      return res.json({ summary: "Traffic intelligence unavailable — enter conditions manually." });
    }
  }

  if (type === "social") {
    const prompt = `You are a social media monitoring agent for Karachi crisis detection. Generate 5 realistic public posts from different accounts that would appear on X/Twitter right now.
Mix: flooding, heatwave, road accident, power outage, waterlogging — pick 2-3 relevant for current season (late spring/early summer Karachi).
Format each post as:
@handle: [post text] #hashtag1 #hashtag2
Use realistic Karachi handles and locations (Clifton, Gulshan, PECHS, Korangi, Saddar, Lyari, Malir).
Some posts in Roman Urdu, some in English. Keep each post under 280 characters.`;
    try {
      const text = await askGemini(prompt, false);
      return res.json({ simulated: true, summary: `⚠️ [SIMULATED FEED — AI-generated demo posts, not real social media]\n\n${text}` });
    } catch {
      return res.json({ summary: "Social signal feed unavailable — enter signal manually." });
    }
  }

  return res.status(400).json({ error: "type must be: weather | traffic | social" });
});

// ─────────────────────────────────────────────────────────────────────────────
// BAND ROOM ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/band/rooms
 * Returns all open Band rooms (one per active incident).
 */
router.get("/band/rooms", async (req, res) => {
  try {
    const rooms = await bandAdapter.getRooms();
    res.json({ count: rooms.length, rooms });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * GET /api/band/rooms/:roomId
 * Returns the room metadata and all messages in the audit trail.
 */
router.get("/band/rooms/:roomId", async (req, res) => {
  try {
    const { roomId } = req.params;
    const room     = await bandAdapter.getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    const messages = await bandAdapter.getMessages(roomId);
    res.json({ room, messages, messageCount: messages.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * GET /api/band/rooms/by-incident/:incidentId
 * Returns the room and its full Band message timeline for a given incident.
 */
router.get("/band/rooms/by-incident/:incidentId", async (req, res) => {
  try {
    const incident = await Incident.findOne({ incidentId: req.params.incidentId });
    if (!incident?.roomId) return res.status(404).json({ error: "No Band room for this incident" });
    const room     = await bandAdapter.getRoom(incident.roomId);
    const messages = await bandAdapter.getMessages(incident.roomId);
    const approvals = await Approval.find({ incident_id: req.params.incidentId }).lean();
    res.json({ room, messages, approvals, messageCount: messages.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * GET /api/band/audit-trail/:incidentId
 * Compliance export: full immutable audit trail for an incident.
 * Suitable for regulator review.
 */
router.get("/band/audit-trail/:incidentId", async (req, res) => {
  try {
    const { incidentId } = req.params;
    const incident  = await Incident.findOne({ incidentId });
    const messages  = await AgentMessage.find({ incident_id: incidentId }).sort({ ts: 1 }).lean();
    const approvals = await Approval.find({ incident_id: incidentId }).sort({ ts: 1 }).lean();

    res.json({
      incidentId,
      roomId:      incident?.roomId ?? null,
      exportedAt:  new Date().toISOString(),
      auditTrail: {
        messages,
        approvals,
        totalMessages:  messages.length,
        totalApprovals: approvals.length,
        agents:  [...new Set(messages.map(m => m.from_agent))],
      },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL GATE ROUTES (Human Commander — Track 3 governance)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/band/approvals/pending
 * Returns all actions currently awaiting human commander approval.
 */
router.get("/band/approvals/pending", (req, res) => {
  try {
    const pending = getPendingApprovals();
    res.json({ count: pending.length, pending });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * POST /api/band/approve
 * Human Commander approves a proposal. Records the decision in the audit trail.
 * Body: { proposalMsgId, approverId, notes? }
 */
router.post("/band/approve", async (req, res) => {
  try {
    const { proposalMsgId, approverId = "human-commander", notes } = req.body;
    if (!proposalMsgId) return res.status(400).json({ error: "proposalMsgId required" });
    const result = await submitDecision(proposalMsgId, 'approved', approverId, notes);
    if (!result.ok) return res.status(400).json(result);
    res.json({ ok: true, decision: 'approved', proposalMsgId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * POST /api/band/veto
 * Human Commander vetoes a proposal. Logs the retraction in the audit trail.
 * Body: { proposalMsgId, approverId, notes? }
 */
router.post("/band/veto", async (req, res) => {
  try {
    const { proposalMsgId, approverId = "human-commander", notes } = req.body;
    if (!proposalMsgId) return res.status(400).json({ error: "proposalMsgId required" });
    const result = await submitDecision(proposalMsgId, 'vetoed', approverId, notes);
    if (!result.ok) return res.status(400).json(result);
    res.json({ ok: true, decision: 'vetoed', proposalMsgId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

/**
 * GET /api/band/approvals/history
 * Full approval history — who approved/vetoed what and when.
 */
router.get("/band/approvals/history", async (req, res) => {
  try {
    const limit   = Math.min(parseInt(req.query.limit as string || "50"), 200);
    const approvals = await Approval.find().sort({ ts: -1 }).limit(limit).lean();
    res.json({ count: approvals.length, approvals });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
