import { Network, Zap, AlertTriangle, X, ChevronRight, MapPin, Locate } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { APIProvider, Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

const GMAPS_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ?? "";

const SEV_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#3b82f6",
  low:      "#22c55e",
};

const SEV_BG: Record<string, string> = {
  critical: "rgba(239,68,68,0.15)",
  high:     "rgba(249,115,22,0.12)",
  medium:   "rgba(59,130,246,0.12)",
  low:      "rgba(34,197,94,0.10)",
};

const TYPE_ICON = (type: string) => {
  if (!type) return "⚠️";
  const t = type.toLowerCase();
  if (t.includes("security") || t.includes("breach")) return "🔒";
  if (t.includes("ddos") || t.includes("attack"))     return "🛡";
  if (t.includes("outage") || t.includes("service"))  return "🔌";
  if (t.includes("data"))     return "🗄";
  if (t.includes("performance") || t.includes("latency")) return "📉";
  if (t.includes("complian")) return "📋";
  return "⚠️";
};

interface AutonomousAction {
  type: string; incidentId: string; actions: string[]; timestamp: string;
}
interface IntelligenceViewProps {
  incidents?: any[];
  resources?: { pool?: Record<string, number>; available?: Record<string, number> };
  autonomousActions?: AutonomousAction[];
  loading?: boolean;
}

// ── Map pan controller (must live inside <Map>) ───────────────────────────────
function MapPanner({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !target) return;
    map.panTo(target);
    map.setZoom(14);
  }, [map, target]);
  return null;
}

// ── Incident marker (inside <Map>) ───────────────────────────────────────────
function IncidentPin({
  inc, selected, onClick,
}: { inc: any; selected: boolean; onClick: () => void }) {
  const unverified = inc.status === "unverified";
  const color = unverified ? "#f59e0b" : (SEV_COLOR[inc.severity] ?? "#3b82f6");
  const bg    = unverified ? "rgba(245,158,11,0.15)" : (SEV_BG[inc.severity] ?? "rgba(59,130,246,0.12)");
  const icon  = unverified ? "❓" : TYPE_ICON(inc.type ?? "");
  return (
    <AdvancedMarker
      position={{ lat: inc.location.lat, lng: inc.location.lng }}
      onClick={onClick}
      zIndex={selected ? 100 : 10}
    >
      <div style={{ position: "relative", cursor: "pointer" }}>
        {/* Outer pulse ring */}
        <motion.div
          animate={{ scale: [1, 1.7, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: unverified ? 1.2 : 2, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute", inset: -10, borderRadius: "50%",
            background: color, opacity: 0.25,
          }}
        />
        {/* Badge */}
        <div style={{
          width: selected ? 44 : 36,
          height: selected ? 44 : 36,
          borderRadius: "50%",
          background: bg,
          border: `${selected ? 3 : 2}px solid ${color}`,
          boxShadow: `0 0 ${selected ? 20 : 12}px ${color}88`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: selected ? 18 : 15,
          transition: "all 0.2s ease",
          backdropFilter: "blur(4px)",
        }}>
          {icon}
        </div>
        {/* Label */}
        <div style={{
          position: "absolute", top: "100%", left: "50%",
          transform: "translateX(-50%)",
          marginTop: 4,
          background: "rgba(10,12,16,0.9)",
          border: `1px solid ${color}44`,
          borderRadius: 5, padding: "1px 5px",
          fontSize: 8, fontWeight: 700, letterSpacing: "0.1em",
          color: color, fontFamily: "monospace",
          textTransform: "uppercase", whiteSpace: "nowrap",
          pointerEvents: "none",
        }}>
          {unverified ? "UNVERIFIED" : inc.severity}
        </div>
      </div>
    </AdvancedMarker>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-white/5 rounded-xl", className)} />;
}
function IntelligenceSkeleton() {
  return (
    <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 h-full">
      <div className="col-span-9 min-h-[500px]"><Skeleton className="w-full h-full rounded-[32px]" /></div>
      <div className="col-span-3 flex flex-col gap-4">
        <Skeleton className="flex-1 rounded-[32px]" /><Skeleton className="h-32 rounded-[24px]" />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function IntelligenceView({
  incidents = [], resources = {}, autonomousActions = [], loading = false,
}: IntelligenceViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panTarget, setPanTarget]   = useState<{ lat: number; lng: number } | null>(null);

  const activeIncidents = incidents.filter(
    (i: any) => i.location?.lat && i.location?.lng && i.status !== "retracted"
  );

  const selected = incidents.find((i: any) => i.incidentId === selectedId) ?? null;

  const selectIncident = useCallback((inc: any) => {
    setSelectedId(inc.incidentId);
    setPanTarget({ lat: inc.location.lat, lng: inc.location.lng });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setPanTarget(null);
  }, []);

  // Resource metrics
  const pool     = resources?.pool      ?? {};
  const avail    = resources?.available ?? {};
  const totalPool = Object.values(pool).reduce((s, v) => s + (v as number), 0);
  const totalDep  = Object.keys(pool).reduce((s, k) => s + Math.max(0, (pool[k] ?? 0) - (avail[k] ?? 0)), 0);
  const utilPct   = totalPool > 0 ? Math.round((totalDep / totalPool) * 100) : 0;

  if (loading) return <IntelligenceSkeleton />;

  // Center the map on the actual incident footprint (global cloud regions),
  // not a hardcoded city. Falls back to a world view when there are none.
  const located = activeIncidents.filter((i: any) => i.location?.lat != null && i.location?.lng != null);
  const mapCenter = located.length
    ? { lat: located.reduce((s: number, i: any) => s + i.location.lat, 0) / located.length,
        lng: located.reduce((s: number, i: any) => s + i.location.lng, 0) / located.length }
    : { lat: 25, lng: 10 };
  const mapZoom = located.length <= 1 ? 4 : 2;

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4 h-full animate-in fade-in duration-500 overflow-y-auto lg:overflow-hidden pb-20 lg:pb-0">

      {/* ── MAP ───────────────────────────────────────────────────────────────── */}
      <section className="col-span-12 lg:col-span-9 min-h-[460px] lg:min-h-0 relative bg-[#0a0c10] border border-white/5 rounded-[32px] overflow-hidden shadow-2xl">

        {GMAPS_KEY ? (
          <APIProvider apiKey={GMAPS_KEY}>
            <Map
              mapId="maestro-intelligence"
              defaultCenter={mapCenter}
              defaultZoom={mapZoom}
              disableDefaultUI
              gestureHandling="greedy"
              colorScheme="DARK"
              style={{ width: "100%", height: "100%" }}
            >
              {/* Pan controller — fires when selectedId changes */}
              <MapPanner target={panTarget} />

              {/* Incident markers */}
              {activeIncidents.map((inc: any) => (
                <IncidentPin
                  key={inc.incidentId}
                  inc={inc}
                  selected={selectedId === inc.incidentId}
                  onClick={() =>
                    selectedId === inc.incidentId ? clearSelection() : selectIncident(inc)
                  }
                />
              ))}
            </Map>
          </APIProvider>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <MapPin className="w-10 h-10 text-white/10" />
            <p className="text-[11px] font-bold text-white/20 uppercase tracking-widest">
              Add VITE_GOOGLE_MAPS_API_KEY to .env
            </p>
          </div>
        )}

        {/* ── Active incident count chip (top-left) ─── */}
        <div className="absolute top-4 left-4 z-10 pointer-events-none">
          <div className="flex items-center gap-2 bg-[#0a0c10]/85 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-2.5">
            <div className={cn(
              "w-2 h-2 rounded-full",
              activeIncidents.length > 0 ? "bg-red-400 animate-pulse" : "bg-white/20"
            )} />
            <span className="font-mono text-[10px] font-black text-white/70 uppercase tracking-widest">
              {activeIncidents.length} Active Incident{activeIncidents.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* ── Severity legend (bottom-right) ─── */}
        <div className="absolute bottom-4 right-4 z-10 pointer-events-none">
          <div className="flex items-center gap-3 bg-[#0a0c10]/85 backdrop-blur-md border border-white/10 rounded-2xl px-3 py-2">
            {(["critical", "high", "medium", "low"] as const).map(s => (
              <div key={s} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: SEV_COLOR[s] }} />
                <span className="font-mono text-[8px] font-bold uppercase text-white/40">{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Incident list overlay (bottom-left) ─── */}
        {activeIncidents.length > 0 && (
          <div className="absolute bottom-4 left-4 z-10 max-w-[260px]">
            <div className="bg-[#0a0c10]/90 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
                <Locate className="w-3 h-3 text-[#00e5ff]" />
                <span className="font-mono text-[9px] font-black text-[#00e5ff] uppercase tracking-widest">
                  Live Incidents
                </span>
              </div>
              <div className="max-h-36 overflow-y-auto">
                {activeIncidents.map((inc: any) => (
                  <button
                    key={inc.incidentId}
                    onClick={() => selectIncident(inc)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all border-b border-white/5 last:border-0",
                      selectedId === inc.incidentId
                        ? "bg-white/10"
                        : "hover:bg-white/5"
                    )}
                  >
                    <span className="text-sm shrink-0">{TYPE_ICON(inc.type)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[9px] font-bold text-white truncate uppercase">
                        {inc.type?.replace(/_/g, " ")}
                      </p>
                      <p className="font-mono text-[8px] text-white/30">
                        {Math.round((inc.confidence ?? 0) * 100)}% conf
                      </p>
                    </div>
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                      style={{ background: SEV_COLOR[inc.severity] ?? "#3b82f6" }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Incident detail drawer (right slide-in) ─── */}
        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              transition={{ type: "spring", damping: 26, stiffness: 260 }}
              className="absolute inset-y-0 right-0 w-full sm:w-[340px] z-20 flex flex-col overflow-hidden"
              style={{ background: "rgba(10,12,16,0.93)", borderLeft: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(24px)" }}
            >
              {/* Header */}
              <div className="p-5 border-b border-white/5 shrink-0">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{TYPE_ICON(selected.type)}</span>
                      <span
                        className="font-mono text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border"
                        style={{
                          color: SEV_COLOR[selected.severity],
                          background: SEV_BG[selected.severity],
                          borderColor: `${SEV_COLOR[selected.severity]}44`,
                        }}
                      >
                        {selected.severity}
                      </span>
                    </div>
                    <h2 className="text-sm font-black text-white uppercase tracking-tight">
                      {selected.type?.replace(/_/g, " ")}
                    </h2>
                    <p className="font-mono text-[8px] text-white/30 mt-0.5">
                      {selected.location?.lat?.toFixed(5)}, {selected.location?.lng?.toFixed(5)}
                    </p>
                  </div>
                  <button
                    onClick={clearSelection}
                    className="p-1.5 rounded-xl border border-white/10 hover:bg-white/10 transition-all shrink-0"
                  >
                    <X className="w-4 h-4 text-white/50" />
                  </button>
                </div>

                {/* Confidence bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round((selected.confidence ?? 0) * 100)}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ background: SEV_COLOR[selected.severity] }}
                    />
                  </div>
                  <span className="font-mono text-[10px] font-black text-white/70">
                    {Math.round((selected.confidence ?? 0) * 100)}%
                  </span>
                  <span className="font-mono text-[8px] text-white/30">confidence</span>
                </div>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">

                {/* Confidence breakdown */}
                {selected.confidenceBreakdown && (
                  <div>
                    <p className="font-mono text-[8px] font-black uppercase tracking-widest text-white/25 mb-2">
                      Confidence Breakdown
                    </p>
                    <div className="space-y-1.5">
                      {(["socialMedia", "weather", "mapsTraffic"] as const).map(src => {
                        const item = selected.confidenceBreakdown?.[src];
                        if (!item) return null;
                        const pct = Math.round((item.score ?? 0) * 100);
                        return (
                          <div key={src} className="flex items-center gap-2">
                            <span className="font-mono text-[8px] text-white/30 uppercase w-20 shrink-0">
                              {src.replace(/([A-Z])/g, " $1").trim()}
                            </span>
                            <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, background: pct >= 75 ? "#22c55e" : pct >= 45 ? "#f59e0b" : "#ef4444" }}
                              />
                            </div>
                            <span className="font-mono text-[8px] font-bold text-white/50 w-8 text-right">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Resources dispatched */}
                <div>
                  <p className="font-mono text-[8px] font-black uppercase tracking-widest text-white/25 mb-2">
                    Resources Dispatched
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { k: "sre", e: "🛠" }, { k: "seceng", e: "🔒" },
                      { k: "dataeng", e: "🗄" }, { k: "ic", e: "🎖" }, { k: "compliance", e: "📋" },
                    ].map(({ k, e }) => {
                      const count = selected.allocatedResources?.[k] ?? 0;
                      return (
                        <div key={k} className="bg-white/[0.04] rounded-xl p-3 border border-white/5 flex items-center gap-2">
                          <span className="text-base">{e}</span>
                          <div>
                            <p className="font-mono text-lg font-black text-white leading-none">{count}</p>
                            <p className="font-mono text-[7px] text-white/30 uppercase mt-0.5">{k}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Agent pipeline trace */}
                {selected.traceLog && selected.traceLog.length > 0 && (
                  <div>
                    <p className="font-mono text-[8px] font-black uppercase tracking-widest text-white/25 mb-2">
                      Agent Pipeline · {selected.traceLog.length} steps
                    </p>
                    <div className="space-y-2">
                      {selected.traceLog.map((step: any, i: number) => (
                        <div
                          key={i}
                          className={cn(
                            "flex items-start gap-2 border-l-2 pl-2 py-0.5",
                            step.agent?.includes("recovery") || step.agent?.includes("verification")
                              ? "border-red-500/40"
                              : "border-[#00e5ff]/20"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <p className={cn(
                              "font-mono text-[8px] font-bold uppercase truncate",
                              step.agent?.includes("recovery") ? "text-red-400" : "text-[#00e5ff]"
                            )}>
                              {step.agent}
                            </p>
                            <p className="font-mono text-[8px] text-white/40 leading-tight">
                              {step.decision?.slice(0, 70)}
                            </p>
                          </div>
                          {step.confidence != null && (
                            <span
                              className="font-mono text-[8px] font-black shrink-0 mt-0.5"
                              style={{
                                color: step.confidence >= 0.75 ? "#22c55e"
                                     : step.confidence >= 0.45 ? "#f59e0b"
                                     : "#ef4444",
                              }}
                            >
                              {Math.round(step.confidence * 100)}%
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Commander summary */}
                {selected.metadata?.commanderSummary && (
                  <div>
                    <p className="font-mono text-[8px] font-black uppercase tracking-widest text-white/25 mb-2">
                      Commander Summary
                    </p>
                    <blockquote className="text-[10px] text-white/65 leading-relaxed italic border-l-2 border-[#00e5ff]/30 pl-3">
                      &ldquo;{selected.metadata.commanderSummary}&rdquo;
                    </blockquote>
                  </div>
                )}

                {/* Language */}
                {selected.detectedLanguage && (
                  <div className="flex items-center gap-3 bg-white/[0.03] rounded-xl p-3 border border-white/5">
                    <span className="text-base">🌐</span>
                    <div>
                      <p className="font-mono text-[8px] text-white/30 uppercase">Detected Language</p>
                      <p className="font-mono text-[10px] font-bold text-[#00e5ff]">
                        {selected.isRomanUrdu ? "Roman Urdu" : selected.detectedLanguage}
                      </p>
                    </div>
                  </div>
                )}

                {/* Infrastructure recommendations */}
                {selected.infrastructureRecommendations?.nearbyFacilities?.length > 0 && (
                  <div>
                    <p className="font-mono text-[8px] font-black uppercase tracking-widest text-white/25 mb-2">
                      Nearby Infrastructure
                    </p>
                    <div className="space-y-1">
                      {selected.infrastructureRecommendations.nearbyFacilities.slice(0, 3).map((f: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-[9px] font-mono text-white/50">
                          <span>{f.type === "hospital" ? "🏥" : f.type === "fire_station" ? "🚒" : "📍"}</span>
                          <span className="truncate">{f.name}</span>
                          {f.distance && <span className="text-white/20 ml-auto shrink-0">{f.distance}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* RETRACTED footer */}
              {selected.status === "retracted" && (
                <div className="p-3 border-t border-red-500/20 bg-red-500/10 shrink-0">
                  <p className="font-mono text-[9px] font-black text-red-400 uppercase tracking-widest text-center">
                    ✕ RETRACTED — Public Alert Cancelled
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────────── */}
      <aside className="col-span-12 lg:col-span-3 flex flex-col gap-4 h-auto lg:h-full overflow-y-auto lg:overflow-hidden">

        {/* Resource Flow */}
        <div className="flex-1 bg-[#0f1117] border border-white/5 rounded-[32px] p-5 flex flex-col shadow-inner min-h-[280px] lg:min-h-0">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-tight">Resource Flow</h2>
              <p className="font-mono text-[9px] text-[#00e5ff]/50 font-bold uppercase tracking-widest">
                Base → Incident · Live
              </p>
            </div>
            <Network className="w-4 h-4 text-[#00e5ff]/40 shrink-0" />
          </div>

          <div className="flex-1 flex flex-col justify-center gap-3 min-h-0">
            {(["sre", "seceng", "dataeng", "ic", "compliance"] as const).map(k => {
              const total = pool[k]  ?? 0;
              const free  = avail[k] ?? 0;
              const dep   = Math.max(0, total - free);
              const pct   = total > 0 ? (dep / total) * 100 : 0;
              const emoji = k === "sre" ? "🛠" : k === "seceng" ? "🔒" : k === "dataeng" ? "🗄" : k === "ic" ? "🎖" : "📋";
              const color = pct > 80 ? "#ef4444" : pct > 50 ? "#f97316" : "#00e5ff";
              return (
                <div key={k}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-mono text-[9px] text-white/40 uppercase tracking-wide">{emoji} {k}</span>
                    <span className="font-mono text-[10px] font-bold" style={{ color }}>
                      {total > 0 ? `${dep} / ${total}` : "—"}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: "0%" }}
                      animate={{ width: total > 0 ? `${pct}%` : "0%" }}
                      transition={{ duration: 0.9, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ background: color, boxShadow: `0 0 6px ${color}55` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-3 shrink-0">
            <div>
              <p className="font-mono text-[8px] text-white/25 uppercase mb-0.5">Utilization</p>
              <p className="font-mono text-2xl font-black leading-none"
                style={{ color: utilPct > 80 ? "#ef4444" : "#00e5ff" }}>
                {totalPool > 0 ? `${utilPct}%` : "—"}
              </p>
            </div>
            <div>
              <p className="font-mono text-[8px] text-white/25 uppercase mb-0.5">Deployed</p>
              <p className="font-mono text-2xl font-black text-white leading-none">
                {totalDep > 0 ? totalDep : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Autonomous Actions */}
        <div className="bg-[#0f1117] border border-white/5 rounded-[24px] p-4 flex flex-col gap-2 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-3 h-3 text-[#00e5ff]" />
            <p className="font-mono text-[9px] font-bold text-[#00e5ff] uppercase tracking-widest">
              Autonomous Actions
            </p>
            {autonomousActions.length > 0 && (
              <span className="ml-auto font-mono text-[9px] text-white/25">
                {autonomousActions.length} fired
              </span>
            )}
          </div>
          {autonomousActions.length === 0 ? (
            <p className="text-[9px] text-white/25 font-mono leading-relaxed">
              No autonomous actions yet. System monitoring…
            </p>
          ) : (
            <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
              {autonomousActions.slice(0, 6).map((a, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-[8px] text-white/35 font-mono border-l-2 border-[#00e5ff]/25 pl-2 leading-relaxed"
                >
                  <span className="text-[#00e5ff] font-bold">{a.type.replace(/_/g, " ").toUpperCase()}</span>
                  {" · "}{a.actions[0]?.slice(0, 55)}
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Critical Alert */}
        <div className="bg-[#0f1117] border border-white/5 rounded-[24px] p-4 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
            <h3 className="font-mono text-[9px] font-black text-yellow-400 uppercase tracking-widest">
              Critical Alert
            </h3>
          </div>
          {(() => {
            const crit = incidents.find(
              (i: any) => i.severity === "critical" && i.status !== "retracted"
            );
            if (!crit) return (
              <p className="text-[9px] text-white/25 font-mono leading-relaxed">
                All systems nominal. No critical incidents detected.
              </p>
            );
            return (
              <div>
                <p className="text-[10px] text-white/65 leading-relaxed mb-2">
                  <span className="font-bold text-red-400">
                    {crit.type?.replace(/_/g, " ").toUpperCase()}
                  </span>
                  {" · "}{Math.round((crit.confidence ?? 0) * 100)}% confidence
                  {crit.location && (
                    <span className="text-white/30">
                      {" "}@ {crit.location.lat?.toFixed(3)}, {crit.location.lng?.toFixed(3)}
                    </span>
                  )}
                </p>
                <div className="flex gap-1.5 flex-wrap mb-3">
                  {crit.allocatedResources &&
                    Object.entries(crit.allocatedResources).map(([k, v]: [string, any]) =>
                      v > 0 ? (
                        <span
                          key={k}
                          className="font-mono text-[8px] bg-red-500/10 border border-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full"
                        >
                          {v} {k}
                        </span>
                      ) : null
                    )}
                </div>
                <button
                  onClick={() => selectIncident(crit)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl text-[9px] font-bold font-mono text-red-400 uppercase tracking-widest transition-all active:scale-95"
                >
                  View on Map <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            );
          })()}
        </div>
      </aside>
    </div>
  );
}
