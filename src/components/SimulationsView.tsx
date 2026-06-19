import React, { useState, useMemo } from "react";
import { AlertTriangle, Activity, Play, CheckCircle2, Loader2, BookOpen, Zap, ShieldAlert, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { APIProvider, Map, AdvancedMarker, Circle } from "@vis.gl/react-google-maps";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { getGoogleMapsApiKey } from "../lib/googleMaps";

const GMAPS_KEY = getGoogleMapsApiKey();

// ── Scenario catalogue ────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    id: "disaster",
    title: "Cascading Failure — DC Power + DB + Exfil",
    description:
      "Datacenter power failure cascades into database replication failure and suspected data exfiltration simultaneously. Tests multi-incident resource contention and triage under maximum operational load.",
    severity: "CRITICAL",
    icon: "🔥",
    color: "#ef4444",
    endpoint: "/api/simulate/disaster",
    tags: ["SRE", "SecEng", "DataEng"],
  },
  {
    id: "world-cup",
    title: "Peak Event — Traffic Surge + DDoS",
    description:
      "14× peak-event traffic surge with a suspected volumetric DDoS riding it. Tests surge protocols and coordinated response across Security and SRE teams.",
    severity: "HIGH",
    icon: "⚡",
    color: "#f97316",
    endpoint: "/api/simulate/world-cup",
    tags: ["SRE", "SecEng"],
  },
  {
    id: "stress-test",
    title: "Stress Test — Credential Breach + Payments Outage",
    description:
      "Credential-stuffing attack fires simultaneously with a payments-API outage. Demonstrates two incident rooms contending for the shared on-call pool, with reallocation visible in real time.",
    severity: "HIGH",
    icon: "🛡",
    color: "#f97316",
    endpoint: "/api/simulate/stress-test",
    tags: ["SecEng", "SRE"],
  },
  {
    id: "false-positive",
    title: "False Positive Recovery",
    description:
      "A social media panic report is ingested and retracted after automated cross-validation. Tests agent correction and resource recall workflows end-to-end.",
    severity: "MEDIUM",
    icon: "🔍",
    color: "#3b82f6",
    endpoint: "/api/simulate/false-positive",
    tags: ["AI Agents", "Cross-validation"],
  },
  {
    id: "scenario-1",
    title: "Outage + Conflicting Signals",
    description:
      "Monitoring reports a database outage while the vendor status page shows all-clear. Tests agent cross-validation and conflict resolution under ambiguous data.",
    severity: "CRITICAL",
    icon: "🗄",
    color: "#ef4444",
    endpoint: "/api/simulate/action",
    body: {
      incidentId: "DR-CONFLICT",
      actionType: "CROSS_VALIDATION",
      parameters: {
        primaryEvent: "Database Outage",
        conflictingSource: "Vendor Status Page",
        discrepancyType: "Internal alerts vs vendor all-clear",
      },
    },
    tags: ["DataEng", "AI Agents"],
  },
  {
    id: "scenario-2",
    title: "Cascading Infrastructure Failure",
    description:
      "Power failure in the primary datacenter cascades to cooling and database clusters. Tests resource reallocation speed across dependent services under maximum load.",
    severity: "HIGH",
    icon: "🏗",
    color: "#f97316",
    endpoint: "/api/simulate/action",
    body: {
      incidentId: "DR-CASCADE",
      actionType: "RESOURCE_REALLOCATION",
      parameters: {
        primaryEvent: "Datacenter Power Failure",
        impactTarget: "Orders DB Cluster",
        cascadingEffect: "Cooling Failure",
      },
    },
    tags: ["SRE", "DataEng"],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const normalizeResult = (data: any, scenarioId: string) => {
  if (data.actionTaken) return data;
  if (data.retractionPlan) {
    return {
      actionTaken: `Retraction executed. Rollback time: ${data.retractionPlan.estimatedRollbackTime ?? "—"}.`,
      metrics: {
        etaLabel: "Rollback Time",
        eta: data.retractionPlan.estimatedRollbackTime ?? "—",
        impactLabel: "Units Released",
        impact: `${
          (data.resourcesReleased?.sre ?? 0) +
          (data.resourcesReleased?.seceng ?? 0) +
          (data.resourcesReleased?.dataeng ?? 0) +
          (data.resourcesReleased?.drone ?? 0)
        } units recalled`,
      },
      afterState:
        data.antigravityTraceCorrection?.correctionNote ??
        data.retractionPlan?.publicCommunication?.message ??
        "Incident retracted — resources recalled.",
      sideEffects: data.retractionPlan?.immediateActions ?? [],
    };
  }
  if (data.incidents) {
    const list = data.incidents as any[];
    return {
      actionTaken: `${data.scenario} — ${list.length} concurrent incidents activated.`,
      metrics: {
        etaLabel: "Incidents Activated",
        eta: `${list.length}`,
        impactLabel: "Total Units",
        impact: `${Object.values((data.resources?.pool ?? {}) as Record<string, number>).reduce((s, v) => s + v, 0)} units`,
      },
      afterState: list
        .map((i: any) => `${i.type ?? "incident"} (${Math.round((i.confidence ?? 0) * 100)}% confidence)`)
        .join(" · ") + " — All AI pipelines active.",
      sideEffects: list.map(
        (i: any) =>
          `${i.type ?? "incident"}: ${i.allocatedResources?.sre ?? 0}🛠 ${i.allocatedResources?.seceng ?? 0}🔒 deployed`
      ),
    };
  }
  if (data.results) {
    const list = Object.values(data.results) as any[];
    return {
      actionTaken: `${data.scenario} — Multi-crisis resource contention demonstrated.`,
      metrics: {
        etaLabel: "Concurrent Crises",
        eta: `${list.length}`,
        impactLabel: "Total Units",
        impact: `${Object.values((data.resourceContention?.pool ?? {}) as Record<string, number>).reduce((s, v) => s + v, 0)}`,
      },
      afterState: `Multiple incidents triggered simultaneously. Resource contention model active across ${list.length} sectors.`,
      sideEffects: list.map(
        (i: any) =>
          `${i.type ?? "incident"}: ${Math.round((i.confidence ?? 0) * 100)}% conf · ${
            (i.allocatedResources?.sre ?? 0) + (i.allocatedResources?.seceng ?? 0) + (i.allocatedResources?.dataeng ?? 0)
          } units`
      ),
    };
  }
  return {
    actionTaken: data.message ?? "Scenario executed.",
    metrics: { etaLabel: "—", eta: "—", impactLabel: "—", impact: "—" },
    afterState: JSON.stringify(data).slice(0, 200),
    sideEffects: [],
  };
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function SimulationsView({ incidents = [] }: { incidents?: any[] }) {
  const [activeScenario, setActiveScenario] = useState<(typeof SCENARIOS)[0] | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const activeIncidents = useMemo(
    () => incidents.filter((i) => i.location?.lat && i.location?.lng && i.status !== "retracted"),
    [incidents]
  );

  const mapCenter = useMemo(() => {
    if (!activeIncidents.length) return { lat: 30.3753, lng: 69.3451 };
    return {
      lat: activeIncidents.reduce((s: number, i: any) => s + i.location.lat, 0) / activeIncidents.length,
      lng: activeIncidents.reduce((s: number, i: any) => s + i.location.lng, 0) / activeIncidents.length,
    };
  }, [activeIncidents]);

  const runScenario = async (scenario: (typeof SCENARIOS)[0]) => {
    setRunning(true);
    setActiveScenario(scenario);
    setResult(null);

    try {
      const body =
        scenario.id === "false-positive"
          ? {
              incidentId: `FP-${Date.now().toString().slice(-4)}`,
              incidentType: "social_media_panic",
              fieldReportId: `FR-${Date.now().toString().slice(-6)}`,
              alertsSent: ["SMS", "WhatsApp", "PublicBroadcast"],
            }
          : (scenario as any).body ?? {};

      const res = await fetch(scenario.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Scenario request failed");
      const data = await res.json();
      setResult(normalizeResult(data, scenario.id));
    } catch (e) {
      console.error("Scenario failed", e);
      setResult({ actionTaken: "Failed to execute scenario — check backend.", metrics: {}, afterState: "", sideEffects: [] });
    } finally {
      setRunning(false);
    }
  };

  const severityColor = (s: string) =>
    s === "CRITICAL" ? "text-red-400 bg-red-500/10 border-red-500/30" :
    s === "HIGH"     ? "text-orange-400 bg-orange-500/10 border-orange-500/30" :
                       "text-blue-400 bg-blue-500/10 border-blue-500/30";

  return (
    <div className="flex flex-col gap-6 h-full animate-in fade-in duration-500 overflow-y-auto pb-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-cyan-500/15 border border-cyan-500/30 rounded-xl flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-cyan-400" />
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              Scenario <span className="text-white/30">Playbook</span>
            </h1>
          </div>
          <p className="text-[11px] text-white/40 font-mono uppercase tracking-widest pl-12">
            Inject real incidents · Test response pipelines · Validate agent coordination
          </p>
        </div>
        <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/25 px-3 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
          <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Live System</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* Left — live map + stats */}
        <div className="flex flex-col gap-4 lg:w-[42%] shrink-0">
          {/* Live incident map */}
          <div className="bg-[#14181f] border border-white/10 rounded-2xl overflow-hidden" style={{ minHeight: 280 }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Live Incident Map</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                <span className="text-[9px] font-bold text-red-400 uppercase tracking-widest">
                  {activeIncidents.length} Active
                </span>
              </div>
            </div>
            <div style={{ height: 220 }}>
              {GMAPS_KEY ? (
                <APIProvider apiKey={GMAPS_KEY}>
                  <Map
                    mapId="scenario-map"
                    center={mapCenter}
                    zoom={activeIncidents.length ? 4 : 2}
                    disableDefaultUI
                    gestureHandling="none"
                    colorScheme="DARK"
                    style={{ width: "100%", height: "100%" }}
                  >
                    {activeIncidents.map((inc: any) => {
                      const color =
                        inc.severity === "critical" ? "#ef4444" :
                        inc.severity === "high"     ? "#f97316" :
                        inc.severity === "medium"   ? "#3b82f6" : "#22c55e";
                      return (
                        <React.Fragment key={inc.incidentId}>
                          <Circle
                            center={{ lat: inc.location.lat, lng: inc.location.lng }}
                            radius={inc.radius ?? 1000}
                            strokeColor={color} strokeOpacity={0.7} strokeWeight={2}
                            fillColor={color} fillOpacity={0.08}
                          />
                          <AdvancedMarker position={{ lat: inc.location.lat, lng: inc.location.lng }}>
                            <div
                              style={{
                                width: 16, height: 16, borderRadius: "50%",
                                background: color, border: "2px solid rgba(255,255,255,0.4)",
                                boxShadow: `0 0 10px ${color}`,
                              }}
                            />
                          </AdvancedMarker>
                        </React.Fragment>
                      );
                    })}
                  </Map>
                </APIProvider>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/20 text-xs font-mono uppercase tracking-widest">
                  Add VITE_GOOGLE_MAPS_API_KEY to .env
                </div>
              )}
            </div>
          </div>

          {/* Live stat strip */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Active Incidents",
                value: incidents.filter((i) => i.status !== "retracted").length,
                color: "#ef4444",
                icon: AlertTriangle,
              },
              {
                label: "Critical",
                value: incidents.filter((i) => i.severity === "critical").length,
                color: "#f97316",
                icon: ShieldAlert,
              },
              {
                label: "In Progress",
                value: incidents.filter((i) => i.status === "active").length,
                color: "#3b82f6",
                icon: Activity,
              },
            ].map((stat) => (
              <div key={stat.label} className="bg-[#14181f] border border-white/10 rounded-2xl p-4 flex flex-col gap-2">
                <stat.icon className="w-3.5 h-3.5" style={{ color: stat.color }} />
                <p className="text-2xl font-black" style={{ color: stat.color }}>{stat.value}</p>
                <p className="text-[8px] font-bold uppercase tracking-widest text-white/30">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Resource allocation strip */}
          <div className="bg-[#14181f] border border-white/10 rounded-2xl p-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Resource Deployment</p>
            <div className="space-y-2">
              {[
                { label: "SREs",     key: "sre",      color: "#ef4444", emoji: "🛠" },
                { label: "SecEng",   key: "seceng",   color: "#3b82f6", emoji: "🔒" },
                { label: "Data Eng", key: "dataeng",  color: "#f97316", emoji: "🗄" },
              ].map(({ label, key, color, emoji }) => {
                const total = incidents.reduce((s: number, i: any) => s + (i.allocatedResources?.[key] ?? 0), 0);
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs w-4">{emoji}</span>
                    <span className="text-[9px] font-bold text-white/40 uppercase w-14">{label}</span>
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, total * 10)}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="text-[9px] font-black font-mono" style={{ color }}>{total}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right — scenario list + result panel */}
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {/* Scenario list */}
          <AnimatePresence mode="wait">
            {!running && !result ? (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-y-auto space-y-3 pr-1"
              >
                <p className="text-[10px] text-white/30 font-mono uppercase tracking-widest mb-2">
                  Select a scenario to inject into the live system
                </p>
                {SCENARIOS.map((scenario) => (
                  <button
                    key={scenario.id}
                    onClick={() => runScenario(scenario)}
                    disabled={running}
                    className={cn(
                      "w-full text-left p-4 bg-[#14181f] border border-white/8 rounded-2xl group hover:border-cyan-500/40 hover:bg-[#1a1f29] transition-all active:scale-[0.99] relative overflow-hidden"
                    )}
                  >
                    {/* glow accent */}
                    <div
                      className="absolute top-0 left-0 bottom-0 w-1 rounded-l-2xl"
                      style={{ backgroundColor: scenario.color }}
                    />
                    <div className="pl-3">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xl">{scenario.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={cn(
                                "text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest",
                                severityColor(scenario.severity)
                              )}
                            >
                              {scenario.severity}
                            </span>
                            {scenario.tags.map((t) => (
                              <span key={t} className="text-[8px] font-bold text-white/20 uppercase">
                                {t}
                              </span>
                            ))}
                          </div>
                          <h4 className="text-sm font-black text-white group-hover:text-cyan-300 transition-colors leading-snug">
                            {scenario.title}
                          </h4>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <div className="w-8 h-8 bg-cyan-500/15 border border-cyan-500/30 rounded-xl flex items-center justify-center">
                            <Play className="w-3.5 h-3.5 text-cyan-400" />
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-white/40 font-mono leading-relaxed line-clamp-2">
                        {scenario.description}
                      </p>
                    </div>
                  </button>
                ))}
              </motion.div>
            ) : running ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center gap-6 bg-[#14181f] border border-white/10 rounded-2xl"
              >
                <div className="relative">
                  <Loader2 className="w-12 h-12 text-cyan-400 animate-spin" />
                  <div className="absolute inset-0 bg-cyan-400/20 blur-2xl rounded-full" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-black text-white uppercase tracking-[0.2em] mb-2">
                    Injecting Scenario
                  </p>
                  <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest">
                    {activeScenario?.title}
                  </p>
                  <p className="text-[9px] text-white/20 font-mono mt-2">
                    Multi-agent pipeline processing…
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-1 overflow-y-auto space-y-4 pr-1"
              >
                {/* Success header */}
                <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-white uppercase">Scenario Completed</p>
                    <p className="text-[9px] font-mono text-emerald-400 font-bold uppercase tracking-widest truncate">
                      {activeScenario?.title}
                    </p>
                  </div>
                  <button
                    onClick={() => { setResult(null); setActiveScenario(null); }}
                    className="text-[9px] font-black text-white/30 uppercase tracking-widest hover:text-white transition-colors shrink-0"
                  >
                    ↺ Reset
                  </button>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: result?.metrics?.etaLabel ?? "ETA Improvement", value: result?.metrics?.eta ?? "—", color: "#22c55e" },
                    { label: result?.metrics?.impactLabel ?? "Impact", value: result?.metrics?.impact ?? "—", color: "#00e5ff" },
                  ].map((m) => (
                    <div key={m.label} className="bg-[#14181f] border border-white/10 rounded-xl p-4">
                      <p className="text-[8px] font-black uppercase text-white/30 mb-1">{m.label}</p>
                      <p className="text-lg font-black" style={{ color: m.color }}>{m.value}</p>
                    </div>
                  ))}
                </div>

                {/* Action taken */}
                <div className="bg-[#14181f] border border-white/10 rounded-xl p-4">
                  <p className="text-[9px] font-black uppercase text-white/30 tracking-widest mb-2 flex items-center gap-2">
                    <TrendingUp className="w-3 h-3" /> Actions Taken
                  </p>
                  <p className="text-xs text-white/80 font-mono leading-relaxed border-l-2 border-cyan-500/50 pl-3 italic">
                    "{result?.actionTaken}"
                  </p>
                </div>

                {/* After state */}
                {result?.afterState && (
                  <div className="bg-[#14181f] border border-white/10 rounded-xl p-4">
                    <p className="text-[9px] font-black uppercase text-white/30 tracking-widest mb-2">System State</p>
                    <p className="text-[11px] text-white/60 font-mono leading-relaxed">
                      {result.afterState}
                    </p>
                  </div>
                )}

                {/* Side effects */}
                {result?.sideEffects?.length > 0 && (
                  <div className="bg-[#14181f] border border-white/10 rounded-xl p-4">
                    <p className="text-[9px] font-black uppercase text-white/30 tracking-widest mb-3">Deployed Resources</p>
                    <div className="space-y-2">
                      {result.sideEffects.map((fx: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-[10px] text-white/50 font-mono">
                          <div className="w-1 h-1 bg-cyan-400 rounded-full mt-1.5 shrink-0" />
                          {fx}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Status footer */}
      <div className="flex items-center justify-between border-t border-white/8 pt-3">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(0,229,255,0.6)]"
          />
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">
            Live Agent Pipeline · All Systems Nominal
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-cyan-400/60" />
          <span className="text-[9px] font-mono text-white/20">{incidents.length} incidents tracked</span>
        </div>
      </div>
    </div>
  );
}
