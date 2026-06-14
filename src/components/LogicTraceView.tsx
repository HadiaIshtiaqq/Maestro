import React, { useState, useMemo, useEffect } from "react";
import {
  Clock, AlertTriangle, Zap, Languages, Globe, ShieldCheck,
  Tag, TrendingUp, Package, Car, Building, Bell, CheckCircle2,
  X, RefreshCw, ChevronDown, ChevronRight, Bot, Activity,
  GitMerge, Map, Database, Search, History,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

// ── Types ─────────────────────────────────────────────────────────────────────
interface TraceStep {
  step:       string;
  agent:      string;
  decision:   string;
  reason:     string;
  confidence?: number;
  timestamp:  number;
}

interface LogicTraceViewProps {
  incidents?:   any[];
  latestTrace?: TraceStep[] | null;
}

// ── Agent metadata (enterprise incident-response pipeline) ─────────────────────
const AGENT_META: Record<string, { label: string; icon: React.ElementType; color: string; group: string }> = {
  "intake-normalization":   { label: "Intake & Normalization",   icon: GitMerge,     color: "#38bdf8", group: "INGESTION"  },
  "correlation-dedup":      { label: "Correlation & Dedup",      icon: GitMerge,     color: "#818cf8", group: "INGESTION"  },
  "validation-credibility": { label: "Validation & Credibility", icon: ShieldCheck,  color: "#a78bfa", group: "ANALYSIS"   },
  "classification":         { label: "Classification",           icon: Tag,          color: "#f472b6", group: "ANALYSIS"   },
  "severity-blast-radius":  { label: "Severity & Blast Radius",  icon: TrendingUp,   color: "#fb923c", group: "ANALYSIS"   },
  "responder-allocation":   { label: "Responder Allocation",     icon: Package,      color: "#34d399", group: "RESPONSE"   },
  "dependency-impact-sim":  { label: "Dependency Impact Sim",    icon: Map,          color: "#2dd4bf", group: "RESPONSE"   },
  "mitigation-projection":  { label: "Mitigation Projection",    icon: TrendingUp,   color: "#fbbf24", group: "RESPONSE"   },
  "runbook-advisor":        { label: "Runbook Advisor",          icon: Building,     color: "#60a5fa", group: "RESPONSE"   },
  "stakeholder-comms":      { label: "Stakeholder Comms",        icon: Bell,         color: "#60a5fa", group: "RESPONSE"   },
  "incident-commander":     { label: "Incident Commander",       icon: Bot,          color: "#00e5ff", group: "COMMAND"    },
  "resource-manager":       { label: "Resource Manager",         icon: Database,     color: "#34d399", group: "RESPONSE"   },
  "correlation-dedup-rule": { label: "Cross-Signal Dedup",       icon: GitMerge,     color: "#818cf8", group: "INGESTION"  },
};

const GROUP_ORDER = ["INGESTION", "ANALYSIS", "RESPONSE", "COMMAND"];

function confidenceCls(c: number) {
  if (c >= 0.75) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (c >= 0.45) return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
  return "bg-red-500/15 text-red-400 border-red-500/30";
}

function severityColor(s?: string) {
  if (s === "critical") return "#ef4444";
  if (s === "high")     return "#f97316";
  if (s === "medium")   return "#3b82f6";
  if (s === "low")      return "#22c55e";
  return "#6b7280";
}

function statusBadge(status?: string) {
  if (status === "active")     return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (status === "unverified") return "bg-amber-500/15  text-amber-400  border-amber-500/30";
  if (status === "retracted")  return "bg-red-500/15    text-red-400    border-red-500/30";
  if (status === "resolving")  return "bg-blue-500/15   text-blue-400   border-blue-500/30";
  return "bg-white/5 text-white/40 border-white/10";
}

// ── Step card (expandable) ────────────────────────────────────────────────────
function StepCard({ step, index, startTs, isFalseAlarm }: {
  step: TraceStep; index: number; startTs: number; isFalseAlarm: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta  = AGENT_META[step.agent] ?? { label: step.agent, icon: Activity, color: "#94a3b8", group: "UNKNOWN" };
  const Icon  = meta.icon;
  const delta = startTs ? step.timestamp - startTs : 0;
  const isRetraction = isFalseAlarm && (step.agent === "recovery-agent" || step.agent === "verification-escalation");
  const isCommand    = step.agent === "incident-commander";
  const decisionText = step.decision ?? step.reason ?? "Agent completed.";

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        "rounded-xl border transition-all cursor-pointer select-none",
        isRetraction ? "bg-red-950/30  border-red-500/30"
        : isCommand  ? "bg-[#00e5ff]/5 border-[#00e5ff]/25"
                     : "bg-white/[0.03] border-white/[0.07] hover:border-white/20"
      )}
      onClick={() => setExpanded(p => !p)}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Step number */}
        <span className="font-mono text-[9px] font-black w-5 text-right flex-shrink-0 opacity-40"
          style={{ color: meta.color }}>
          {String(index + 1).padStart(2, "0")}
        </span>

        {/* Agent icon */}
        <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${meta.color}18` }}>
          <Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
        </div>

        {/* Agent name + decision preview */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold truncate" style={{ color: meta.color }}>
              {meta.label}
            </span>
            <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded border border-white/10 text-white/25 flex-shrink-0">
              {meta.group}
            </span>
          </div>
          {!expanded && (
            <p className="text-[9px] text-white/40 truncate leading-tight">{decisionText}</p>
          )}
        </div>

        {/* Right: confidence + delta + chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {step.confidence != null && (
            <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded border", confidenceCls(step.confidence))}>
              {Math.round(step.confidence * 100)}%
            </span>
          )}
          {isRetraction && (
            <span className="text-[7px] font-black bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded uppercase">
              RETRACT
            </span>
          )}
          <span className="font-mono text-[8px] text-white/20">+{delta}ms</span>
          {expanded ? <ChevronDown className="w-3 h-3 text-white/20" /> : <ChevronRight className="w-3 h-3 text-white/20" />}
        </div>
      </div>

      {/* Expanded reasoning */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-1 border-t border-white/5 space-y-2">
              <div>
                <p className="text-[8px] font-black uppercase text-white/25 mb-1">Decision</p>
                <p className="text-[10px] text-white/70 leading-relaxed">{decisionText}</p>
              </div>
              {step.reason && step.reason !== step.decision && (
                <div>
                  <p className="text-[8px] font-black uppercase text-white/25 mb-1">Reasoning</p>
                  <p className="text-[10px] text-white/50 leading-relaxed italic">{step.reason}</p>
                </div>
              )}
              <p className="text-[8px] font-mono text-white/20 pt-1">
                {new Date(step.timestamp).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 })}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LogicTraceView({ incidents = [], latestTrace }: LogicTraceViewProps) {
  const [selectedId, setSelectedId]           = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup]      = useState<string | null>(null);
  const [historicalTraces, setHistoricalTraces] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory]    = useState(false);
  const [historyError, setHistoryError]        = useState<string | null>(null);

  // Select first incident by default
  useEffect(() => {
    if (!selectedId && incidents.length > 0) {
      setSelectedId(incidents[0].incidentId);
    }
  }, [incidents, selectedId]);

  const selectedIncident = useMemo(
    () => incidents.find(i => i.incidentId === selectedId) ?? incidents[0] ?? null,
    [incidents, selectedId]
  );

  // Use traceLog from the selected incident; fall back to latestTrace prop
  const traceSteps: TraceStep[] = useMemo(() => {
    const log = (selectedIncident as any)?.traceLog;
    if (Array.isArray(log) && log.length > 0) return log;
    if (Array.isArray(latestTrace) && latestTrace.length > 0) return latestTrace;
    return [];
  }, [selectedIncident, latestTrace]);

  const startTs = traceSteps[0]?.timestamp ?? 0;
  const endTs   = traceSteps[traceSteps.length - 1]?.timestamp ?? 0;
  const durationMs = traceSteps.length >= 2 ? endTs - startTs : null;

  const isFalseAlarm = selectedIncident?.status === "retracted"
    || traceSteps.some(s => /false.alarm|retract/i.test(s.decision ?? "") || /false.alarm|retract/i.test(s.reason ?? ""));

  // Pull intel from specific agent outputs inside the trace
  const langStep   = traceSteps.find(s => s.agent === "language-detection");
  const credStep   = traceSteps.find(s => s.agent === "credibility-analysis");
  const sevStep    = traceSteps.find(s => s.agent === "severity-prediction");
  const cmdStep    = traceSteps.find(s => s.agent === "incident-commander");
  const allocStep  = traceSteps.find(s => s.agent === "resource-allocation");
  const infraStep  = traceSteps.find(s => s.agent === "infrastructure-advisor");
  const stakeStep  = traceSteps.find(s => s.agent === "stakeholder-notification");

  const confidenceBreakdown = (selectedIncident as any)?.confidenceBreakdown ?? null;
  const allocatedResources  = (selectedIncident as any)?.allocatedResources  ?? null;
  const metadata            = (selectedIncident as any)?.metadata            ?? {};

  // Group steps for the timeline
  const groupedSteps = useMemo(() => {
    const groups: Record<string, TraceStep[]> = {};
    for (const step of traceSteps) {
      const group = AGENT_META[step.agent]?.group ?? "UNKNOWN";
      if (!groups[group]) groups[group] = [];
      groups[group].push(step);
    }
    return GROUP_ORDER.filter(g => groups[g]).map(g => ({ name: g, steps: groups[g] }));
  }, [traceSteps]);

  // Load historical traces from backend
  const fetchHistory = async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const res  = await fetch("/api/traces/all?limit=20");
      const data = await res.json();
      setHistoricalTraces(data.traces ?? []);
    } catch {
      setHistoryError("Could not load historical traces.");
    } finally {
      setLoadingHistory(false);
    }
  };

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (incidents.length === 0 && !latestTrace) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 animate-in fade-in duration-500">
        <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center">
          <Activity className="w-10 h-10 text-white/10" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-lg font-black text-white/20 uppercase tracking-widest">No traces yet</p>
          <p className="text-xs text-white/15 max-w-xs">
            Report an incident via Signal Input or the AI Assistant to see the full 11-agent pipeline trace here.
          </p>
        </div>
        <button
          onClick={fetchHistory}
          disabled={loadingHistory}
          className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/60 hover:border-white/20 transition-all disabled:opacity-40"
        >
          {loadingHistory
            ? <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full" /> Loading…</>
            : <><Database className="w-3.5 h-3.5" /> Load Historical Traces</>
          }
        </button>
        {historyError && <p className="text-[9px] text-red-400">{historyError}</p>}
        {historicalTraces.length > 0 && (
          <div className="w-full max-w-2xl space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 text-center">Historical traces ({historicalTraces.length})</p>
            {historicalTraces.slice(0, 5).map((t: any, i: number) => (
              <div key={i} className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-3 flex items-center gap-4">
                <span className="font-mono text-[8px] text-white/25">{t.taskId?.slice(0, 8)}…</span>
                <span className="text-[10px] text-white/50 font-bold capitalize flex-1">{t.type ?? "Unknown"}</span>
                <span className="text-[9px] font-mono text-white/30">{t.results?.length ?? 0} steps</span>
                <span className="text-[8px] text-white/20">{t.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Main view ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 h-full animate-in fade-in duration-500 overflow-y-auto pr-1 custom-scrollbar">

      {/* ── Incident selector ──────────────────────────────────────────────── */}
      {incidents.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <span className="text-[8px] font-black uppercase tracking-widest text-white/25 shrink-0">Trace:</span>
          {incidents.map(inc => (
            <button
              key={inc.incidentId}
              onClick={() => setSelectedId(inc.incidentId)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-wider transition-all flex-shrink-0",
                selectedId === inc.incidentId || (!selectedId && inc === incidents[0])
                  ? "bg-[#00e5ff]/10 border-[#00e5ff]/40 text-[#00e5ff]"
                  : "bg-white/5 border-white/10 text-white/40 hover:text-white/60"
              )}
            >
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: severityColor(inc.severity) }} />
              {inc.type?.replace(/_/g, " ").slice(0, 18)}
              <span className="font-mono text-[7px] opacity-50">{inc.incidentId?.slice(0, 6)}</span>
            </button>
          ))}
          <button
            onClick={fetchHistory}
            disabled={loadingHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 text-[9px] font-black uppercase text-white/25 hover:text-white/50 transition-all flex-shrink-0 disabled:opacity-40"
          >
            {loadingHistory
              ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-3 h-3 border border-white/20 border-t-white rounded-full" />
              : <History className="w-3 h-3" />
            }
            History
          </button>
        </div>
      )}

      {/* ── Incident header card ───────────────────────────────────────────── */}
      {selectedIncident && (
        <div className={cn(
          "rounded-2xl border p-5",
          isFalseAlarm ? "bg-red-950/20 border-red-500/25" : "bg-[#00e5ff]/[0.04] border-[#00e5ff]/20"
        )}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                {isFalseAlarm && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-[8px] font-black uppercase">
                    <AlertTriangle className="w-2.5 h-2.5" /> FALSE ALARM
                  </span>
                )}
                <span className={cn("px-2 py-0.5 rounded-lg border text-[8px] font-black uppercase", statusBadge(selectedIncident.status))}>
                  {selectedIncident.status}
                </span>
                <span className="px-2 py-0.5 rounded-lg text-[8px] font-black uppercase"
                  style={{ background: `${severityColor(selectedIncident.severity)}20`, color: severityColor(selectedIncident.severity), border: `1px solid ${severityColor(selectedIncident.severity)}40` }}>
                  {selectedIncident.severity}
                </span>
              </div>
              <h2 className="text-xl font-black text-white uppercase leading-tight truncate">
                {selectedIncident.type?.replace(/_/g, " ") ?? "Unknown Incident"}
              </h2>
              <p className="text-[10px] text-white/40 font-mono mt-1">
                INC-{selectedIncident.incidentId?.slice(0, 8)} ·{" "}
                {Math.round((selectedIncident.confidence ?? 0) * 100)}% confidence ·{" "}
                {selectedIncident.location?.lat?.toFixed(4)}, {selectedIncident.location?.lng?.toFixed(4)}
                {selectedIncident.detectedLanguage && ` · ${selectedIncident.isRomanUrdu ? "Roman Urdu" : selectedIncident.detectedLanguage}`}
              </p>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-right">
                <p className="text-[8px] font-black uppercase text-white/30">Pipeline</p>
                <p className="font-mono text-lg font-black text-white">
                  {durationMs != null ? `${durationMs.toLocaleString()}ms` : "—"}
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-right">
                <p className="text-[8px] font-black uppercase text-white/30">Agents</p>
                <p className="font-mono text-lg font-black text-[#00e5ff]">{traceSteps.length}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Main two-column layout ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* LEFT: Pipeline trace timeline ──────────────────────────────────── */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/30">
              Agentic Pipeline — {traceSteps.length} Steps
            </span>
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="flex items-center gap-1.5"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#00e5ff]" />
              <span className="text-[8px] font-black uppercase tracking-widest text-[#00e5ff]">Live</span>
            </motion.div>
          </div>

          {traceSteps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-white/10 rounded-2xl">
              <Activity className="w-8 h-8 text-white/10 mb-3" />
              <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Waiting for pipeline trace…</p>
            </div>
          ) : (
            <div className="space-y-1.5 relative">
              {/* Vertical connector line */}
              <div className="absolute left-[1.6rem] top-2 bottom-2 w-px bg-gradient-to-b from-[#38bdf8]/30 via-[#a78bfa]/20 to-[#00e5ff]/30 pointer-events-none" />

              {traceSteps.map((step, i) => (
                <StepCard
                  key={`${step.step}-${i}`}
                  step={step}
                  index={i}
                  startTs={startTs}
                  isFalseAlarm={isFalseAlarm}
                />
              ))}
            </div>
          )}

          {/* Load history button below timeline */}
          {incidents.length === 0 && (
            <button
              onClick={fetchHistory}
              disabled={loadingHistory}
              className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 bg-white/[0.03] border border-dashed border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-white/25 hover:text-white/50 hover:border-white/20 transition-all disabled:opacity-40"
            >
              {loadingHistory ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-3.5 h-3.5 border border-white/20 border-t-white rounded-full" /> : <History className="w-3.5 h-3.5" />}
              Load Historical Traces
            </button>
          )}
        </div>

        {/* RIGHT: Intelligence panel ───────────────────────────────────────── */}
        <div className="lg:col-span-5 space-y-4">

          {/* Language Detection */}
          {(selectedIncident?.detectedLanguage || langStep) && (
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Languages className="w-3.5 h-3.5 text-[#38bdf8]" />
                <span className="text-[9px] font-black uppercase tracking-widest text-[#38bdf8]">Language Detection</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-3 h-3 text-white/30" />
                <span className="text-sm font-black text-white">
                  {selectedIncident?.detectedLanguage ?? "English"}
                </span>
                {selectedIncident?.isRomanUrdu && (
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[8px] font-black">
                    Roman Urdu
                  </span>
                )}
              </div>
              {langStep?.reason && (
                <p className="text-[9px] text-white/40 leading-relaxed italic">{langStep.reason.slice(0, 120)}{langStep.reason.length > 120 ? "…" : ""}</p>
              )}
            </div>
          )}

          {/* 3-Source Confidence Breakdown */}
          {confidenceBreakdown && (
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#a78bfa]" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#a78bfa]">3-Source Confidence</span>
                </div>
                <span className={cn(
                  "text-[8px] font-black px-2 py-0.5 rounded-full border",
                  confidenceBreakdown.displayLevel === "CRITICAL" ? "text-red-400 border-red-400/30 bg-red-400/10" :
                  confidenceBreakdown.displayLevel === "HIGH"     ? "text-[#00e5ff] border-[#00e5ff]/30 bg-[#00e5ff]/10" :
                  confidenceBreakdown.displayLevel === "MEDIUM"   ? "text-amber-400 border-amber-400/30 bg-amber-400/10" :
                                                                     "text-white/40 border-white/10 bg-white/5"
                )}>{confidenceBreakdown.displayLevel}</span>
              </div>
              {(["socialMedia", "weather", "mapsTraffic"] as const).map(key => {
                const s = confidenceBreakdown[key] as any;
                if (!s) return null;
                const pct = Math.round((s.score ?? 0) * 100);
                const label = key === "socialMedia" ? "Social Media" : key === "weather" ? "Weather" : "Maps/Traffic";
                const color = key === "socialMedia" ? "#3b82f6" : key === "weather" ? "#38bdf8" : "#00e5ff";
                return (
                  <div key={key} className="mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[8px] font-bold uppercase text-white/50">{label}</span>
                      <div className="flex items-center gap-2">
                        {s.verdict && (
                          <span className={cn("text-[7px] font-black uppercase px-1.5 py-0.5 rounded",
                            s.verdict === "STRONG"   ? "bg-emerald-500/15 text-emerald-400" :
                            s.verdict === "MODERATE" ? "bg-yellow-500/15 text-yellow-400"  :
                                                       "bg-red-500/15 text-red-400"
                          )}>{s.verdict}</span>
                        )}
                        <span className="font-mono text-[9px] font-black" style={{ color }}>{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="h-full rounded-full" style={{ backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
                <span className="text-[8px] font-black uppercase text-white/30">Weighted Score</span>
                <span className="font-mono text-sm font-black text-[#00e5ff]">
                  {Math.round((confidenceBreakdown.weightedScore ?? 0) * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* Resource Allocation */}
          {allocatedResources && (
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-3.5 h-3.5 text-[#34d399]" />
                <span className="text-[9px] font-black uppercase tracking-widest text-[#34d399]">Allocated Resources</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { key: "sre",       icon: "🛠", label: "SRE" },
                  { key: "seceng",    icon: "🔒", label: "SecEng" },
                  { key: "dataeng",   icon: "🗄", label: "Data" },
                  { key: "ic",        icon: "🎖", label: "IC" },
                ].map(r => (
                  <div key={r.key} className="bg-white/5 rounded-lg p-2 text-center">
                    <span className="text-base">{r.icon}</span>
                    <p className="font-black text-sm text-white mt-0.5">{allocatedResources[r.key] ?? 0}</p>
                    <p className="text-[7px] uppercase text-white/30 font-bold">{r.label}</p>
                  </div>
                ))}
              </div>
              {allocStep?.reason && (
                <p className="text-[8px] text-white/30 italic mt-2 leading-relaxed">{allocStep.reason.slice(0, 100)}{allocStep.reason.length > 100 ? "…" : ""}</p>
              )}
            </div>
          )}

          {/* Severity Prediction */}
          {(metadata.severityPrediction || sevStep) && (
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-3.5 h-3.5 text-[#fb923c]" />
                <span className="text-[9px] font-black uppercase tracking-widest text-[#fb923c]">Severity Prediction</span>
              </div>
              {(() => {
                const s = metadata.severityPrediction;
                if (!s) return <p className="text-[9px] text-white/40 italic">{sevStep?.decision?.slice(0, 120)}</p>;
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="px-2 py-1 rounded-lg font-black text-xs uppercase"
                        style={{ background: `${severityColor(s.severity)}20`, color: severityColor(s.severity) }}>
                        {s.severity}
                      </div>
                      <span className="text-[9px] text-white/50">Score: {s.severityScore?.toFixed(1)}</span>
                    </div>
                    {s.timeToWorsen && <p className="text-[9px] text-white/40">⏱ Worsen in: {s.timeToWorsen}</p>}
                    {s.spreadRisk   && <p className="text-[9px] text-white/40">📡 Spread risk: {s.spreadRisk}</p>}
                    {s.estimatedCasualties && (
                      <p className="text-[9px] text-white/40">
                        👥 Casualties — Best: {s.estimatedCasualties.best} / Likely: {s.estimatedCasualties.likely} / Worst: {s.estimatedCasualties.worst}
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Infrastructure */}
          {infraStep?.reason && (
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Building className="w-3.5 h-3.5 text-[#2dd4bf]" />
                <span className="text-[9px] font-black uppercase tracking-widest text-[#2dd4bf]">Infrastructure Advisor</span>
              </div>
              <p className="text-[9px] text-white/50 leading-relaxed">{infraStep.reason.slice(0, 180)}{infraStep.reason.length > 180 ? "…" : ""}</p>
            </div>
          )}

          {/* Commander Summary */}
          {(metadata.commanderSummary || cmdStep?.decision) && (
            <div className={cn(
              "rounded-xl border p-4",
              isFalseAlarm ? "bg-red-950/20 border-red-500/25" : "bg-[#00e5ff]/[0.04] border-[#00e5ff]/20"
            )}>
              <div className="flex items-center gap-2 mb-3">
                <Bot className="w-3.5 h-3.5 text-[#00e5ff]" />
                <span className="text-[9px] font-black uppercase tracking-widest text-[#00e5ff]">Incident Commander AI</span>
                {isFalseAlarm && <span className="ml-auto text-[7px] font-black uppercase px-1.5 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded">RETRACTED</span>}
              </div>
              <p className="text-[11px] text-white/75 leading-relaxed italic">
                &ldquo;{(metadata.commanderSummary ?? cmdStep?.decision ?? "").slice(0, 300)}
                {(metadata.commanderSummary ?? cmdStep?.decision ?? "").length > 300 ? "…" : ""}&rdquo;
              </p>
            </div>
          )}

          {/* Stakeholder Notifications */}
          {metadata.stakeholderMessages && (
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Bell className="w-3.5 h-3.5 text-[#60a5fa]" />
                <span className="text-[9px] font-black uppercase tracking-widest text-[#60a5fa]">Stakeholder Notifications</span>
              </div>
              <p className="text-[9px] text-white/40 leading-relaxed">
                {stakeStep?.reason?.slice(0, 150) ?? "Notifications dispatched to relevant authorities."}
              </p>
            </div>
          )}

        </div>
      </div>

      {/* ── Historical traces overlay ──────────────────────────────────────── */}
      <AnimatePresence>
        {historicalTraces.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="border border-white/10 rounded-2xl p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] font-black uppercase tracking-widest text-white/30">
                Historical Pipeline Runs ({historicalTraces.length})
              </span>
              <button onClick={() => setHistoricalTraces([])}
                className="text-white/20 hover:text-white/50 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-1.5">
              {historicalTraces.map((t: any, i: number) => (
                <div key={i} className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-2 flex items-center gap-4">
                  <span className="font-mono text-[8px] text-white/20 flex-shrink-0">{t.taskId?.slice(0, 8)}…</span>
                  <span className="text-[10px] font-bold text-white/60 capitalize flex-1 truncate">
                    {t.type?.replace(/_/g, " ") ?? "Pipeline Run"}
                  </span>
                  <span className="text-[9px] font-mono text-white/25 flex-shrink-0">{t.results?.length ?? 0} steps</span>
                  <span className={cn("text-[8px] font-black uppercase px-2 py-0.5 rounded border flex-shrink-0",
                    t.status === "completed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
                  )}>{t.status}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
