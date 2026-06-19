import { Router } from "express";
import { IncidentService } from "../services/incidentService";
import { seedDemoIncidents } from "../scripts/seedDemoData";
import { maestroOrchestrator } from "../agents/ciroAgents";
import { resourceManager } from "../services/resourceManager";
import { ActionSimulator } from "../simulations/actionSimulator";
import { fetchAllLiveData, fetchGDACS, fetchKarachiWeather, fetchUSGSEarthquakes } from "../services/realDataService";
import { getRecentAutonomousActions } from "../services/autonomousActions";
import { getGeminiCacheStats, chatIncidentIntake, askGemini } from "../services/geminiService";
import { Incident, DispatchLog, AgentMessage, BandRoom as BandRoomModel, Approval } from "../models/index";
import { eventBus } from "../events/eventBus";
import { bandAdapter } from "../band/adapter";
import { submitDecision, getPendingApprovals } from "../services/approvalService";
import { operatorAuth, rateLimit } from "../middlewares/index";
import { escapeRegExp } from "../lib/authUtils";
import {
  IngestSignalSchema,
  VerifyIncidentSchema,
  DispatchLogSchema,
  OperatorTakeoverSchema,
  OperatorResolveSchema,
  OperatorNotesSchema,
  OperatorEscalateSchema,
  OperatorBulkCloseSchema,
  BandDecisionSchema,
  ChatIncidentSchema,
  VoiceTranscribeSchema,
  SignalSourceSchema,
} from "../lib/validationSchemas";

const router = Router();

// Privileged routes: operator actions + human approval gate + demo seeding
router.use("/operator", operatorAuth);
router.use("/band/approve", operatorAuth);
router.use("/band/veto", operatorAuth);
router.use("/seed-demo", operatorAuth);
router.use("/admin", operatorAuth);
router.use("/simulate", operatorAuth);
router.use("/scenario", operatorAuth);

/**
 * POST /api/admin/reset-demo
 * Clears all incidents/signals/Band rooms/messages/approvals so a demo
 * recording starts from a clean board. Operator-key gated.
 */
router.post("/admin/reset-demo", async (req, res) => {
  try {
    const { Incident, Signal, AgentMessage, BandRoom: BandRoomModel, Approval, DispatchLog } = await import("../models/index");
    const [inc, sig, msg, rooms, appr, disp] = await Promise.all([
      Incident.deleteMany({}),
      Signal.deleteMany({}),
      AgentMessage.deleteMany({}),
      BandRoomModel.deleteMany({}),
      Approval.deleteMany({}),
      DispatchLog.deleteMany({}),
    ]);
    bandAdapter.clearLocal();
    resourceManager.getStatus().activeIncidents.forEach((a: any) => resourceManager.release(a.incidentId));
    // Reseed fresh enterprise demo incidents unless ?reseed=false
    if (req.query.reseed !== "false") {
      await seedDemoIncidents();
    }
    eventBus.emit("resources:updated", resourceManager.getStatus());
    res.json({
      ok: true,
      cleared: {
        incidents: inc.deletedCount, signals: sig.deletedCount, bandMessages: msg.deletedCount,
        rooms: rooms.deletedCount, approvals: appr.deletedCount, dispatches: disp.deletedCount,
      },
      reseeded: req.query.reseed !== "false",
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// LLM-backed endpoints: each call is expensive — cap per IP per minute
router.use("/ingest-signal", rateLimit(10));
router.use("/signals", rateLimit(10));
router.use("/chat", rateLimit(20));
router.use("/voice-transcribe", rateLimit(6));
router.use("/simulate", rateLimit(6));
router.use("/data/live-context", rateLimit(12));

// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL ROUTES
// ─────────────────────────────────────────────────────────────────────────────

router.post("/signals/:source", async (req, res) => {
  try {
    const { source } = req.params;
    const parsed = SignalSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid signal payload", issues: parsed.error.issues });
    }
    const result = await IncidentService.processNewSignal({
      ...parsed.data,
      source: source as "social" | "siem" | "monitoring" | "sensor" | "call",
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
    const { source, location, async: runAsync, ...rest } = parsed.data;

    if (source === "call" && rest.type === "manual_report") {
      const result = await IncidentService.processManualReport(
        { ...rest, source: source as any, timestamp: new Date() },
        location ?? undefined
      );
      return res.status(201).json(result);
    }

    // async: true → acknowledge immediately, run the multi-agent pipeline in
    // the background (results arrive via Socket.IO incident:created/updated)
    if (runAsync === true) {
      IncidentService.processNewSignal({ ...rest, source: source as any, timestamp: new Date() })
        .catch(err => console.error("[Ingest] Background pipeline failed:", err));
      return res.status(202).json({
        accepted: true,
        message:  "Signal accepted — pipeline running; watch incident:created / band:message events",
      });
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
    if (type)     filter.type     = new RegExp(escapeRegExp(type), "i");

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

router.post("/incidents/verify", operatorAuth, async (req, res) => {
  try {
    const parsed = VerifyIncidentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    }
    const { incidentId, status, fieldReport } = parsed.data;
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

router.post("/verify-status", operatorAuth, async (req, res) => {
  try {
    const parsed = VerifyIncidentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    }
    const { incidentId, status, fieldReport } = parsed.data;
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
    const parsed = ChatIncidentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    }
    const result = await chatIncidentIntake(parsed.data.messages);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VOICE TRANSCRIPTION (Gemini multimodal)
// ─────────────────────────────────────────────────────────────────────────────

const MAX_AUDIO_BASE64_CHARS = 8 * 1024 * 1024; // ~6MB of audio

router.post("/voice-transcribe", async (req, res) => {
  try {
    const parsed = VoiceTranscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    }
    const { audioBase64, mimeType } = parsed.data;
    if (audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
      return res.status(413).json({ error: "Audio too large — max ~6MB" });
    }
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
    const parsed = OperatorTakeoverSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    }
    const { incidentId, operatorId } = parsed.data;

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
    const parsed = OperatorResolveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    }
    const { incidentId, notes, operatorId } = parsed.data;

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
    const parsed = OperatorNotesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    }
    const { incidentId, note, operatorId } = parsed.data;

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
    const parsed = OperatorEscalateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    }
    const { incidentId, severity, status, reason, operatorId } = parsed.data;

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
    const parsed = OperatorBulkCloseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    }
    const { incidentIds, reason, operatorId } = parsed.data;

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
router.post("/dispatch-log", operatorAuth, async (req, res) => {
  try {
    const parsed = DispatchLogSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    }
    const { incidentId, service, message, sentBy, channel } = parsed.data;
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
router.patch("/dispatch-log/:logId/acknowledge", operatorAuth, async (req, res) => {
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
// SCENARIO / PLAYBOOK ROUTES  (inject real incidents into the live system)
// ─────────────────────────────────────────────────────────────────────────────

router.post("/simulate/action",         async (req, res) => {
  try { const result = await ActionSimulator.simulate(req.body); res.json(result); }
  catch (error: any) { res.status(500).json({ error: error.message }); }
});
router.post("/scenario/action",         async (req, res) => {
  try { const result = await ActionSimulator.simulate(req.body); res.json(result); }
  catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post("/simulate/impact",         async (req, res) => {
  try { const result = await ActionSimulator.simulateImpact(req.body); res.json(result); }
  catch (error: any) { res.status(500).json({ error: error.message }); }
});
router.post("/scenario/impact",         async (req, res) => {
  try { const result = await ActionSimulator.simulateImpact(req.body); res.json(result); }
  catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post("/simulate/false-positive", async (req, res) => {
  try { const result = await ActionSimulator.simulateFalsePositiveRecovery(req.body); res.json(result); }
  catch (error: any) { res.status(500).json({ error: error.message }); }
});
router.post("/scenario/false-positive", async (req, res) => {
  try { const result = await ActionSimulator.simulateFalsePositiveRecovery(req.body); res.json(result); }
  catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post("/simulate/stress-test",   async (req, res) => {
  try {
    const [breachResult, outageResult] = await Promise.all([
      IncidentService.processNewSignal({
        source: "siem", type: "credential_stuffing",
        data: { failed_attempts_5min: 14200, unique_ips: 630, service: "customer-identity", description: "Credential stuffing surge against production identity service" },
        urgency: 9, timestamp: new Date(),
      }),
      IncidentService.processNewSignal({
        source: "monitoring", type: "service_outage",
        data: { service: "payments-api", error_rate_pct: 84, p99_latency_ms: 30000, description: "Payments API error-rate spike — checkout failing" },
        urgency: 8, timestamp: new Date(),
      }),
    ]);
    res.json({
      scenario:  "Simultaneous Security Breach + Platform Outage (shared on-call pool)",
      startedAt: new Date().toISOString(),
      results: { securityIncident: breachResult, outageIncident: outageResult },
      resourceContention: resourceManager.getStatus(),
    });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});
router.post("/scenario/stress-test",   async (req, res) => {
  try {
    const [breachResult, outageResult] = await Promise.all([
      IncidentService.processNewSignal({
        source: "siem", type: "credential_stuffing",
        data: { failed_attempts_5min: 14200, unique_ips: 630, service: "customer-identity", description: "Credential stuffing surge against production identity service" },
        urgency: 9, timestamp: new Date(),
      }),
      IncidentService.processNewSignal({
        source: "monitoring", type: "service_outage",
        data: { service: "payments-api", error_rate_pct: 84, p99_latency_ms: 30000, description: "Payments API error-rate spike — checkout failing" },
        urgency: 8, timestamp: new Date(),
      }),
    ]);
    res.json({
      scenario:  "Simultaneous Security Breach + Platform Outage (shared on-call pool)",
      startedAt: new Date().toISOString(),
      results: { securityIncident: breachResult, outageIncident: outageResult },
      resourceContention: resourceManager.getStatus(),
    });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

router.post("/simulate/disaster",      async (req, res) => {
  try {
    const [r1, r2, r3] = await Promise.all([
      IncidentService.processNewSignal({ source: "sensor",     type: "datacenter_power_failure", data: { site: "us-east-dc2", ups_status: "battery", runtime_min: 18, description: "Primary datacenter on UPS — generator failed to start" },           urgency: 10, timestamp: new Date() }),
      IncidentService.processNewSignal({ source: "monitoring", type: "db_replication_failure",   data: { cluster: "orders-primary", replication_lag_s: 1900, description: "Replica lag past failover threshold — split-brain risk" },              urgency:  9, timestamp: new Date() }),
      IncidentService.processNewSignal({ source: "siem",       type: "data_exfil_alert",         data: { egress_gb: 41, destination: "unrecognized ASN", description: "Anomalous bulk egress during outage window" },                              urgency:  9, timestamp: new Date() }),
    ]);
    res.json({ scenario: "CASCADING FAILURE — power loss + replication failure + suspected exfiltration", incidents: [r1, r2, r3], resources: resourceManager.getStatus() });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post("/scenario/disaster",      async (req, res) => {
  try {
    const [r1, r2, r3] = await Promise.all([
      IncidentService.processNewSignal({ source: "sensor",     type: "datacenter_power_failure", data: { site: "us-east-dc2", ups_status: "battery", runtime_min: 18, description: "Primary datacenter on UPS — generator failed to start" },           urgency: 10, timestamp: new Date() }),
      IncidentService.processNewSignal({ source: "monitoring", type: "db_replication_failure",   data: { cluster: "orders-primary", replication_lag_s: 1900, description: "Replica lag past failover threshold — split-brain risk" },              urgency:  9, timestamp: new Date() }),
      IncidentService.processNewSignal({ source: "siem",       type: "data_exfil_alert",         data: { egress_gb: 41, destination: "unrecognized ASN", description: "Anomalous bulk egress during outage window" },                              urgency:  9, timestamp: new Date() }),
    ]);
    res.json({ scenario: "CASCADING FAILURE — power loss + replication failure + suspected exfiltration", incidents: [r1, r2, r3], resources: resourceManager.getStatus() });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/simulate/world-cup",     async (req, res) => {
  try {
    const [r1, r2] = await Promise.all([
      IncidentService.processNewSignal({ source: "monitoring", type: "traffic_surge",  data: { rps_multiplier: 14, autoscaler: "at max", service: "storefront", description: "Peak-event traffic surge — autoscaling exhausted" }, urgency: 9, timestamp: new Date() }),
      IncidentService.processNewSignal({ source: "siem",       type: "ddos_suspected", data: { rps_from_top_asn_pct: 61, description: "Traffic concentration suggests volumetric DDoS riding the peak event" },                      urgency: 8, timestamp: new Date() }),
    ]);
    res.json({ scenario: "PEAK EVENT — traffic surge + suspected DDoS", incidents: [r1, r2], resources: resourceManager.getStatus() });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.post("/scenario/world-cup",     async (req, res) => {
  try {
    const [r1, r2] = await Promise.all([
      IncidentService.processNewSignal({ source: "monitoring", type: "traffic_surge",  data: { rps_multiplier: 14, autoscaler: "at max", service: "storefront", description: "Peak-event traffic surge — autoscaling exhausted" }, urgency: 9, timestamp: new Date() }),
      IncidentService.processNewSignal({ source: "siem",       type: "ddos_suspected", data: { rps_from_top_asn_pct: 61, description: "Traffic concentration suggests volumetric DDoS riding the peak event" },                      urgency: 8, timestamp: new Date() }),
    ]);
    res.json({ scenario: "PEAK EVENT — traffic surge + suspected DDoS", incidents: [r1, r2], resources: resourceManager.getStatus() });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// AGENT / TRACE ROUTES
// ─────────────────────────────────────────────────────────────────────────────

router.get("/agents/status", async (req, res) => {
  const traces    = maestroOrchestrator.getAllTraces();
  const persisted = await maestroOrchestrator.getPersistedTraces(5).catch(() => []);
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
    const traces = await maestroOrchestrator.getPersistedTraces(limit);
    res.json({ count: traces.length, traces });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/traces/:taskId", (req, res) => {
  const trace = maestroOrchestrator.getTrace(req.params.taskId);
  if (!trace) return res.status(404).json({ error: "Trace not found" });
  res.json(trace);
});

// ─────────────────────────────────────────────────────────────────────────────
// LIVE DATA ROUTES
// ─────────────────────────────────────────────────────────────────────────────

router.post("/live-feed", operatorAuth, async (req, res) => {
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

  // The three tabs map to enterprise signal sources: monitoring, ticketing, SIEM.
  if (type === "weather") { // Monitoring stream
    const prompt = `You are an observability/monitoring platform. Generate a concise 4-line real-time health snapshot across services: payments-api, checkout, orders-db, auth-gateway, search-api, edge/CDN.
For each, give one metric (error rate, p99 latency, replication lag, saturation, or RPS) with a value and whether it's within or breaching SLO. Be specific and realistic. No markdown.`;
    try {
      const text = await askGemini(prompt, false);
      return res.json({ summary: `📈 Monitoring Stream\n\n${text}` });
    } catch {
      return res.json({ summary: "Monitoring stream unavailable — enter signal manually." });
    }
  }

  if (type === "traffic") { // Ticketing feed
    const prompt = `You are an incident ticketing/on-call system (PagerDuty/Jira style). Generate 4 recent tickets/alerts as short lines.
Format each as: [SEV-n] <service> — <one-line symptom> (source: monitoring|siem|customer)
Cover a mix: latency, error spike, failed deploy, cert expiry, disk pressure, suspicious auth. Realistic service names. No markdown.`;
    try {
      const text = await askGemini(prompt, false);
      return res.json({ summary: `🎫 Ticketing Feed\n\n${text}` });
    } catch {
      return res.json({ summary: "Ticketing feed unavailable — enter signal manually." });
    }
  }

  if (type === "social") { // SIEM stream
    const prompt = `You are a SIEM (security information and event management) platform. Generate 5 recent security signals as short alert lines.
Format each as: [severity] <rule/detection> — <source IP/ASN or host> — <one-line detail>
Mix: credential stuffing, anomalous egress/exfil, privilege escalation, DDoS/volumetric, malware beacon, impossible-travel login. Realistic and specific. No markdown.`;
    try {
      const text = await askGemini(prompt, false);
      return res.json({ summary: `🛡 SIEM Stream\n\n${text}` });
    } catch {
      return res.json({ summary: "SIEM stream unavailable — enter signal manually." });
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
router.get("/band/audit-trail/:incidentId", operatorAuth, async (req, res) => {
  try {
    const { incidentId } = req.params;
    const incident  = await Incident.findOne({ incidentId });
    const messages  = await AgentMessage.find({ incident_id: incidentId }).sort({ ts: 1 }).lean();
    const approvals = await Approval.find({ incident_id: incidentId }).sort({ ts: 1 }).lean();

    const { verifyChain } = await import("../band/adapter");
    const chain = verifyChain(messages as any);

    res.json({
      incidentId,
      roomId:      incident?.roomId ?? null,
      exportedAt:  new Date().toISOString(),
      integrity: {
        tamperEvident: true,
        algorithm:     "SHA-256 hash chain",
        verified:      chain.ok,
        ...(chain.ok ? {} : { brokenAtIndex: chain.brokenAt }),
      },
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
    const parsed = BandDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    }
    const { proposalMsgId, approverId = "human-commander", notes } = parsed.data;
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
    const parsed = BandDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });
    }
    const { proposalMsgId, approverId = "human-commander", notes } = parsed.data;
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
