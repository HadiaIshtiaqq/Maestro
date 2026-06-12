import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search, ChevronRight, Activity, User, FileText,
  AlertCircle, CheckCircle, Plus, Send,
  Globe, MessageSquare, Mic, X,
  PhoneCall, Volume2, Shield,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import CommandMap from "./CommandMap";
import BandRoomTimeline from "./BandRoomTimeline";
import type { LiveIncident } from "../hooks/useLiveIncidents";
import { operatorFetch } from "../lib/operatorFetch";

function cn(...i: ClassValue[]) { return twMerge(clsx(i)); }

function deriveMode(inc: LiveIncident): "disaster" | "world_cup" | "normal" {
  const t = (inc.type ?? "").toLowerCase();
  if (/flood|heatwave|earthquake|hurricane|wildfire|landslide|tsunami|fire|explosion/.test(t)) return "disaster";
  if (/crowd|venue|event|world.cup|stadium|sport/.test(t)) return "world_cup";
  return "normal";
}

function deriveControlState(inc: LiveIncident): string {
  const s = inc.status ?? "";
  if (s === "unverified")              return "Unverified";
  if (s === "analyzing" || s === "detected") return "AI Leading";
  if (s === "active")    return "Active Call";
  if (s === "resolving") return "Resolving";
  return "AI Active";
}

function formatTs(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  } catch { return ""; }
}

const MODE_CLS: Record<string, string> = {
  disaster:  "bg-red-900/70   text-red-300   border-red-800/60",
  world_cup: "bg-yellow-900/70 text-yellow-300 border-yellow-800/60",
  normal:    "bg-slate-800/80  text-slate-300  border-slate-700/60",
};
const MODE_LABEL: Record<string, string> = { disaster: "DISASTER", world_cup: "WORLD CUP", normal: "NORMAL" };

const SEV_CLS: Record<string, string> = {
  critical: "bg-red-600     text-white",
  high:     "bg-orange-600  text-white",
  medium:   "bg-blue-700    text-white",
  low:      "bg-slate-700   text-slate-200",
};
const SEV_LABEL: Record<string, string> = { critical: "CRITICAL", high: "URGENT", medium: "NON-EMERG", low: "LOW" };

const CTRL_CLS: Record<string, string> = {
  "Unverified":  "bg-amber-900/60   text-amber-400   border-amber-800/50",
  "AI Leading":  "bg-cyan-900/60    text-cyan-400    border-cyan-800/50",
  "Active Call": "bg-blue-900/60    text-blue-400    border-blue-800/50",
  "Resolving":   "bg-yellow-900/60  text-yellow-400  border-yellow-800/50",
  "AI Active":   "bg-emerald-900/60 text-emerald-400 border-emerald-800/50",
};

type DrawerTab = "triage" | "operator" | "details" | "voice" | "messages" | "band";
type UrgFilter  = "all" | "critical" | "urgent" | "non_emergency";
type StatusFilter = "all" | "active" | "awaiting" | "escalated" | "resolved";

interface Props {
  incidents: LiveIncident[];
  mode: string;
  onRefresh?: () => void;
}

export default function IncidentCommandView({ incidents, mode, onRefresh }: Props) {
  const [selected,   setSelected]   = useState<LiveIncident | null>(null);
  const [tab,        setTab]        = useState<DrawerTab>("triage");
  const [search,     setSearch]     = useState("");
  const [urgF,       setUrgF]       = useState<UrgFilter>("all");
  const [statF,      setStatF]      = useState<StatusFilter>("all");
  const [noteText,   setNoteText]   = useState("");
  const [smsMsg,     setSmsMsg]     = useState("");
  const [notes,      setNotes]      = useState<Record<string, string[]>>({});
  const [resolved,   setResolved]   = useState<Set<string>>(new Set());
  const [taken,      setTaken]      = useState<Set<string>>(new Set());
  const [feedback,   setFeedback]   = useState("");

  const flash = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(""), 2800); };

  const modeFiltered = useMemo(() => {
    if (mode === "all") return incidents;
    return incidents.filter(i => deriveMode(i) === mode || mode === "normal" && deriveMode(i) === "normal");
  }, [incidents, mode]);

  const filtered = useMemo(() => modeFiltered.filter(inc => {
    const sev = inc.severity ?? "low";
    if (urgF === "critical"      && sev !== "critical")  return false;
    if (urgF === "urgent"        && sev !== "high")       return false;
    if (urgF === "non_emergency" && !["medium","low"].includes(sev)) return false;
    if (statF === "active"    && !["active", "unverified"].includes(inc.status)) return false;
    if (statF === "awaiting"  && inc.status !== "analyzing") return false;
    if (statF === "escalated" && !["critical","high"].includes(inc.severity)) return false;
    if (statF === "resolved"  && !resolved.has(inc.incidentId)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (inc.type?.toLowerCase().includes(q) || inc.incidentId?.toLowerCase().includes(q));
    }
    return true;
  }), [modeFiltered, urgF, statF, search, resolved]);

  const handleSelect = (inc: LiveIncident) => { setSelected(inc); setTab("triage"); };

  const handleTakeover = async () => {
    if (!selected) return;
    try { await operatorFetch("/api/operator/takeover", { method: "POST", body: JSON.stringify({ incidentId: selected.incidentId }) }); } catch {}
    setTaken(p => new Set(p).add(selected.incidentId));
    flash("Operator control assumed");
  };

  const handleResolve = async () => {
    if (!selected) return;
    try { await operatorFetch("/api/operator/resolve", { method: "POST", body: JSON.stringify({ incidentId: selected.incidentId }) }); } catch {}
    setResolved(p => new Set(p).add(selected.incidentId));
    flash("Incident marked resolved");
  };

  const handleSendSms = async () => {
    if (!smsMsg.trim() || !selected) return;
    try {
      await fetch("/api/users/dispatch", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: "ambulance", incidentId: selected.incidentId, incidentType: selected.type, location: selected.location, severity: selected.severity, message: smsMsg, unitsNeeded: 1 }),
      });
    } catch {}
    flash("SMS dispatched"); setSmsMsg("");
  };

  const handleAddNote = () => {
    if (!selected || !noteText.trim()) return;
    setNotes(p => ({ ...p, [selected.incidentId]: [...(p[selected.incidentId] ?? []), noteText.trim()] }));
    setNoteText(""); flash("Note saved");
  };

  const defaultSms = selected
    ? `INC-${selected.incidentId?.slice(0, 8)}: ${selected.type?.replace(/_/g, " ")} reported at ${selected.location?.lat?.toFixed(4)}, ${selected.location?.lng?.toFixed(4)}. Confidence ${Math.round((selected.confidence ?? 0) * 100)}%. Resources dispatched.`
    : "";

  return (
    <div className="flex h-full w-full overflow-hidden">

      {/* LEFT PANEL: Incident Queue */}
      <div className="w-[340px] flex-shrink-0 flex flex-col bg-[#0d1117] border-r border-white/[0.08] overflow-hidden">

        {/* Search + filters */}
        <div className="p-3 border-b border-white/[0.08] flex-shrink-0">
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search incidents..."
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-500/40"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {(["all", "critical", "urgent", "non_emergency"] as const).map(u => (
              <button key={u} onClick={() => setUrgF(u)}
                className={cn("px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border transition-all",
                  urgF === u
                    ? u === "critical" ? "bg-red-600/30 border-red-500/50 text-red-300"
                      : u === "urgent" ? "bg-orange-600/30 border-orange-500/50 text-orange-300"
                      : u === "non_emergency" ? "bg-blue-700/30 border-blue-600/50 text-blue-300"
                      : "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                    : "bg-white/5 border-white/10 text-white/40 hover:text-white/70")}>
                {u === "non_emergency" ? "Non-Emerg" : u === "all" ? "All urgency" : u}
              </button>
            ))}
          </div>
          <div className="flex gap-1 flex-wrap mt-1.5">
            {(["all", "active", "awaiting", "escalated", "resolved"] as const).map(s => (
              <button key={s} onClick={() => setStatF(s)}
                className={cn("px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all",
                  statF === s ? "bg-white/15 text-white" : "text-white/30 hover:text-white/60")}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <div className="px-3 py-2 border-b border-white/5 flex-shrink-0">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/25">
            {filtered.length} incident{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Incident cards */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-white/20">
              <AlertCircle className="w-6 h-6 mb-2" />
              <p className="text-xs">No incidents match filters</p>
            </div>
          ) : filtered.map((inc, idx) => {
            const isSel  = selected?.incidentId === inc.incidentId;
            const incMode = deriveMode(inc);
            const ctrl   = deriveControlState(inc);
            const isRes  = resolved.has(inc.incidentId);
            const score  = (inc.confidence ?? 0).toFixed(2);
            const summary = (inc as any).metadata?.commanderSummary
              ?? `${inc.type?.replace(/_/g, " ")} detected with ${Math.round((inc.confidence ?? 0) * 100)}% confidence.`;

            return (
              <motion.button key={inc.incidentId} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => handleSelect(inc)}
                className={cn(
                  "w-full text-left px-3 py-3 border-b border-white/5 transition-all",
                  isSel ? "bg-cyan-500/10 border-l-2 border-l-cyan-500" : "hover:bg-white/[0.03]"
                )}>
                {/* Row 1: ID + mode + urgency badges */}
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  <span className="text-[9px] font-mono text-white/30">INC-{inc.incidentId?.slice(0, 8)}</span>
                  <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wider", MODE_CLS[incMode])}>
                    {MODE_LABEL[incMode]}
                  </span>
                  <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider", SEV_CLS[inc.severity] ?? "bg-slate-700 text-white")}>
                    {SEV_LABEL[inc.severity] ?? "UNKNOWN"}
                  </span>
                </div>
                {/* Type title */}
                <div className="font-bold text-[13px] text-white leading-tight mb-1">
                  {inc.type?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) ?? "Unknown Incident"}
                </div>
                {/* Summary */}
                <div className="text-[10px] text-white/50 leading-snug line-clamp-2 mb-1.5">{summary}</div>
                {/* Control state */}
                <div className="flex gap-1 flex-wrap mb-1.5">
                  {inc.status === "retracted" ? (
                    <span className="text-[8px] font-black px-2 py-0.5 rounded border bg-red-900/60 text-red-300 border-red-700/60 uppercase tracking-wider">
                      ✕ RETRACTED
                    </span>
                  ) : (
                    <>
                      <span className={cn("text-[8px] font-bold px-1.5 py-0.5 rounded border", CTRL_CLS[ctrl] ?? CTRL_CLS["AI Active"])}>
                        {ctrl}
                      </span>
                      {taken.has(inc.incidentId) && (
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded border bg-purple-900/60 text-purple-400 border-purple-800/50">
                          Operator
                        </span>
                      )}
                    </>
                  )}
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded border bg-white/5 text-white/30 border-white/10">
                    Score {score}
                  </span>
                </div>
                {/* AI active + time */}
                <div className="flex items-center justify-between">
                  <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded border",
                    inc.status === "retracted" ? "bg-red-900/50 text-red-400 border-red-800/50"
                    : isRes ? "bg-green-900/60 text-green-400 border-green-800/50"
                            : "bg-emerald-900/60 text-emerald-400 border-emerald-800/50")}>
                    {inc.status === "retracted" ? "retracted" : isRes ? "resolved" : "AI active"}
                  </span>
                  <span className="text-[9px] text-white/25 font-mono">{formatTs(inc.createdAt)}</span>
                </div>
                <div className="text-[9px] text-white/25 mt-0.5 truncate">
                  {inc.location?.lat?.toFixed(3)}, {inc.location?.lng?.toFixed(3)}
                  {inc.detectedLanguage ? ` | ${inc.isRomanUrdu ? "Roman Urdu" : inc.detectedLanguage}` : ""}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* CENTER: Map */}
      <div className="flex-1 relative overflow-hidden">
        <CommandMap incidents={incidents} selectedId={selected?.incidentId} onSelect={handleSelect} />
      </div>

      {/* RIGHT PANEL: Incident Drawer */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected.incidentId}
            initial={{ x: 380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 380, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-[380px] flex-shrink-0 flex flex-col bg-[#0d1117] border-l border-white/[0.08] overflow-hidden"
          >
            {/* Drawer header */}
            <div className={cn(
              "px-4 py-3 border-b flex-shrink-0",
              selected.status === "retracted" ? "border-red-700/40 bg-red-950/20" : "border-white/[0.08]"
            )}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] font-mono text-white/30">INC-{selected.incidentId?.slice(0, 8)}</span>
                  <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded border uppercase", MODE_CLS[deriveMode(selected)])}>
                    {MODE_LABEL[deriveMode(selected)]}
                  </span>
                  <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded uppercase", SEV_CLS[selected.severity] ?? "bg-slate-700 text-white")}>
                    {SEV_LABEL[selected.severity] ?? "UNKNOWN"}
                  </span>
                  {selected.status === "retracted" && (
                    <span className="text-[8px] font-black px-2 py-0.5 rounded border bg-red-900/60 text-red-300 border-red-700/60 uppercase tracking-wider animate-pulse">
                      ✕ RETRACTED
                    </span>
                  )}
                </div>
                <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white transition-colors flex-shrink-0 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <h2 className="font-bold text-sm text-white">
                {selected.type?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </h2>
              <p className="text-[10px] text-white/40 mt-1 leading-snug line-clamp-2">
                {(selected as any).metadata?.commanderSummary ?? `${selected.type} at ${selected.location?.lat?.toFixed(4)}, ${selected.location?.lng?.toFixed(4)}`}
              </p>
              {feedback && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="mt-2 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5">
                  {feedback}
                </motion.div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/[0.08] flex-shrink-0 overflow-x-auto">
              {([
                { id: "triage",   label: "Triage",     Icon: Activity      },
                { id: "operator", label: "Operator",    Icon: User          },
                { id: "details",  label: "Details",     Icon: FileText      },
                { id: "voice",    label: "Live Voice",  Icon: Mic           },
                { id: "messages", label: "Messages",    Icon: MessageSquare },
                { id: "band",     label: "Band Room",   Icon: Shield        },
              ] as const).map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={cn("flex items-center gap-1 px-3 py-2.5 text-[9px] font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap",
                    tab === t.id ? "border-cyan-500 text-cyan-400" : "border-transparent text-white/30 hover:text-white/60")}>
                  <t.Icon className="w-3 h-3" />{t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4">
              <AnimatePresence mode="wait">
                <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>

                  {/* TRIAGE */}
                  {tab === "triage" && (
                    <div className="space-y-3">
                      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">AI Confidence</span>
                          <span className="text-2xl font-black text-cyan-400">{Math.round((selected.confidence ?? 0) * 100)}%</span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-1.5">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${Math.round((selected.confidence ?? 0) * 100)}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="h-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500" />
                        </div>
                      </div>

                      {selected.confidenceBreakdown && (
                        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4">
                          <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">Source Breakdown</h3>
                          <div className="space-y-2.5">
                            {[
                              { key: "socialMedia", label: "Social Media" },
                              { key: "weather",     label: "Weather Data" },
                              { key: "mapsTraffic", label: "Maps & Traffic" },
                            ].map(({ key, label }) => {
                              const src = (selected.confidenceBreakdown as any)[key];
                              if (!src) return null;
                              return (
                                <div key={key}>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="text-white/50">{label}</span>
                                    <span className="font-bold text-white">{Math.round((src.score ?? 0) * 100)}%</span>
                                  </div>
                                  <div className="w-full bg-white/5 rounded-full h-1">
                                    <div className="h-1 rounded-full bg-cyan-500/70" style={{ width: `${Math.round((src.score ?? 0) * 100)}%` }} />
                                  </div>
                                  {src.verdict && <p className="text-[9px] text-white/25 mt-0.5">{src.verdict}</p>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {selected.traceLog && selected.traceLog.length > 0 && (
                        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4">
                          <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">Agent Pipeline</h3>
                          <div className="space-y-2">
                            {selected.traceLog.slice(0, 11).map((step, i) => (
                              <motion.div key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.04 }} className="flex gap-2.5 items-start">
                                <div className="w-4 h-4 mt-0.5 flex-shrink-0 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
                                  <span className="text-[7px] font-black text-cyan-400">{i + 1}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-[10px] font-bold text-white/80">{step.agent}</div>
                                  <div className="text-[9px] text-white/35 mt-0.5 leading-snug">{step.decision}</div>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      )}

                      {(selected as any).resourceTradeoffs?.length > 0 && (
                        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4">
                          <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">Resource Trade-offs</h3>
                          <ul className="space-y-1">
                            {(selected as any).resourceTradeoffs.map((t: string, i: number) => (
                              <li key={i} className="text-[10px] text-white/50 flex gap-2">
                                <span className="text-cyan-500 flex-shrink-0">&#8250;</span>{t}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* OPERATOR */}
                  {tab === "operator" && (
                    <div className="space-y-3">
                      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4">
                        <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">Operator Actions</h3>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={handleTakeover} disabled={taken.has(selected.incidentId)}
                            className={cn("flex items-center justify-center gap-2 py-2.5 rounded-lg border font-bold text-xs uppercase tracking-wider transition-all active:scale-95",
                              taken.has(selected.incidentId)
                                ? "bg-purple-900/50 border-purple-700/50 text-purple-400"
                                : "bg-white/[0.06] border-white/[0.15] text-white hover:bg-white/[0.12] hover:border-white/25")}>
                            <User className="w-3.5 h-3.5" />
                            {taken.has(selected.incidentId) ? "In Control" : "Take Over"}
                          </button>
                          <button onClick={handleResolve} disabled={resolved.has(selected.incidentId)}
                            className={cn("flex items-center justify-center gap-2 py-2.5 rounded-lg border font-bold text-xs uppercase tracking-wider transition-all active:scale-95",
                              resolved.has(selected.incidentId)
                                ? "bg-emerald-900/50 border-emerald-700/50 text-emerald-400"
                                : "bg-white/[0.06] border-white/[0.15] text-white hover:bg-emerald-900/30 hover:border-emerald-700/50 hover:text-emerald-300")}>
                            <CheckCircle className="w-3.5 h-3.5" />
                            {resolved.has(selected.incidentId) ? "Resolved" : "Mark Resolved"}
                          </button>
                        </div>
                      </div>

                      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4">
                        <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">SMS Message</h3>
                        <textarea
                          value={smsMsg || defaultSms}
                          onChange={e => setSmsMsg(e.target.value)}
                          rows={4}
                          maxLength={240}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-cyan-500/40 resize-none leading-relaxed"
                        />
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[9px] text-white/25">{(smsMsg || defaultSms).length}/240</span>
                          <button onClick={handleSendSms}
                            className="flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white py-1.5 px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition-all active:scale-95">
                            <Send className="w-3 h-3" />Send SMS
                          </button>
                        </div>
                      </div>

                      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4">
                        <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">Operator Notes</h3>
                        <div className="space-y-2 max-h-24 overflow-y-auto mb-2">
                          {(notes[selected.incidentId] ?? []).length === 0
                            ? <p className="text-[10px] text-white/20">No notes yet</p>
                            : (notes[selected.incidentId] ?? []).map((n, i) => (
                                <div key={i} className="text-[10px] text-white/60 bg-white/5 rounded-lg px-3 py-2">
                                  <span className="text-white/25 mr-2">[{i + 1}]</span>{n}
                                </div>
                              ))}
                        </div>
                        <textarea
                          value={noteText}
                          onChange={e => setNoteText(e.target.value)}
                          placeholder="Add operational context or resolution note..."
                          rows={2}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-cyan-500/40 resize-none"
                        />
                        <button onClick={handleAddNote}
                          className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-white/10 text-white/60 text-xs font-bold uppercase tracking-wider hover:bg-white/[0.08] hover:text-white transition-all active:scale-95">
                          <Plus className="w-3.5 h-3.5" />Add Note
                        </button>
                      </div>
                    </div>
                  )}

                  {/* DETAILS */}
                  {tab === "details" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: "Severity",   val: selected.severity?.toUpperCase(), cls: selected.severity === "critical" ? "text-red-400" : selected.severity === "high" ? "text-orange-400" : "text-cyan-400" },
                          { label: "Status",     val: selected.status?.toUpperCase(), cls: "text-white" },
                          { label: "Radius",     val: `${(selected as any).radius ?? 0}m`, cls: "text-white" },
                          { label: "Confidence", val: `${Math.round((selected.confidence ?? 0) * 100)}%`, cls: "text-cyan-400" },
                        ].map(({ label, val, cls }) => (
                          <div key={label} className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3">
                            <div className="text-[8px] text-white/30 uppercase tracking-wider font-black mb-1">{label}</div>
                            <div className={cn("font-black text-sm", cls)}>{val}</div>
                          </div>
                        ))}
                      </div>

                      {selected.allocatedResources && (
                        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4">
                          <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">Resources Deployed</h3>
                          <div className="grid grid-cols-4 gap-2">
                            {([
                              { key: "ambulance", label: "AMB",  name: "Ambulance" },
                              { key: "police",    label: "POL",  name: "Police"    },
                              { key: "fire",      label: "FIR",  name: "Fire"      },
                              { key: "drone",     label: "DRN",  name: "Drone"     },
                            ] as const).map(({ key, label, name }) => (
                              <div key={key} className="text-center bg-white/5 rounded-lg p-2">
                                <div className="text-xs font-black text-white/50 mb-1">{label}</div>
                                <div className="text-base font-black text-white">{(selected.allocatedResources as any)[key] ?? 0}</div>
                                <div className="text-[8px] text-white/35">{name}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {(selected as any).infrastructureRecommendations?.nearbyHospitals?.length > 0 && (
                        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4">
                          <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2">Nearby Hospitals</h3>
                          {(selected as any).infrastructureRecommendations.nearbyHospitals.slice(0, 3).map((h: any) => (
                            <div key={h.id} className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
                              <span className="text-white/70 font-medium">{h.name}</span>
                              <span className="text-white/30">{h.distanceKm?.toFixed(1)}km | {h.bedsAvailable} beds</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {selected.detectedLanguage && (
                        <div className="flex items-center gap-2 text-xs text-white/40 bg-white/[0.04] border border-white/[0.08] rounded-xl p-3">
                          <Globe className="w-4 h-4" />
                          Language: <span className="text-white/70 font-bold">{selected.detectedLanguage}</span>
                          {selected.isRomanUrdu && <span className="text-cyan-400">(Roman Urdu)</span>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* LIVE VOICE */}
                  {tab === "voice" && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.08] rounded-xl p-3">
                        <div className="relative">
                          <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                            <Volume2 className="w-4 h-4 text-cyan-400" />
                          </div>
                          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0d1117]" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">AI Triage Agent</div>
                          <div className="text-[9px] text-emerald-400">Live - Pipeline Active</div>
                        </div>
                        <div className="ml-auto flex items-center gap-1">
                          {[1,2,3,4,5].map(i => (
                            <motion.div key={i}
                              animate={{ height: [4, 14, 4] }}
                              transition={{ duration: 0.8, delay: i * 0.15, repeat: Infinity }}
                              className="w-0.5 bg-cyan-400/60 rounded-full"
                            />
                          ))}
                        </div>
                      </div>

                      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-[9px] font-black uppercase tracking-widest text-white/40">Live Transcript</h3>
                          <span className="text-[8px] text-white/20">{selected.traceLog?.length ?? 0} events</span>
                        </div>
                        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                          <div className="flex gap-2 justify-start">
                            <div className="w-5 h-5 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <PhoneCall className="w-2.5 h-2.5 text-orange-400" />
                            </div>
                            <div className="bg-white/5 rounded-xl rounded-tl-none px-3 py-2 max-w-[85%]">
                              <div className="text-[8px] text-orange-400 font-black mb-0.5">CALLER</div>
                              <div className="text-[10px] text-white/70 leading-relaxed">
                                {`Signal received: ${selected.type?.replace(/_/g, " ")} at coordinates ${selected.location?.lat?.toFixed(4)}, ${selected.location?.lng?.toFixed(4)}.`}
                                {selected.detectedLanguage && ` Language: ${selected.isRomanUrdu ? "Roman Urdu" : selected.detectedLanguage}.`}
                              </div>
                            </div>
                          </div>

                          {selected.traceLog?.slice(0, 8).map((step, i) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.06 }}
                              className="flex gap-2 justify-end">
                              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl rounded-tr-none px-3 py-2 max-w-[85%]">
                                <div className="text-[8px] text-cyan-400 font-black mb-0.5 uppercase">{step.agent}</div>
                                <div className="text-[10px] text-white/70 leading-relaxed">{step.decision ?? step.reason ?? "Agent completed analysis."}</div>
                              </div>
                              <div className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-[7px] font-black text-cyan-400">{i + 1}</span>
                              </div>
                            </motion.div>
                          ))}

                          {(!selected.traceLog || selected.traceLog.length === 0) && (
                            <div className="text-center py-6 text-white/20">
                              <Mic className="w-6 h-6 mx-auto mb-2 opacity-30" />
                              <p className="text-xs">No transcript - pipeline pending</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-white/10 text-white/40 text-xs font-bold uppercase tracking-wider hover:bg-white/[0.08] hover:text-white transition-all">
                          <PhoneCall className="w-3.5 h-3.5" />Call Back
                        </button>
                        <button className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-white/10 text-white/40 text-xs font-bold uppercase tracking-wider hover:bg-white/[0.08] hover:text-white transition-all">
                          <Send className="w-3.5 h-3.5" />Export Log
                        </button>
                      </div>
                    </div>
                  )}

                  {/* MESSAGES */}
                  {tab === "messages" && (() => {
                    const msgs      = (selected as any).metadata?.stakeholderMessages;
                    const sev       = (selected as any).metadata?.severityPrediction;
                    const rollback  = (selected as any).metadata?.falsePositiveRollback;
                    const isRetracted = selected.status === "retracted";
                    return (
                      <div className="space-y-3">

                        {/* Retraction notice */}
                        {isRetracted && (
                          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                            className="bg-red-500/[0.10] border border-red-500/40 rounded-xl p-4">
                            <h3 className="text-[9px] font-black uppercase tracking-widest text-red-400 mb-2 flex items-center gap-1.5">
                              <span>✕</span> Public alert retracted
                            </h3>
                            <p className="text-xs text-red-300/80 leading-relaxed mb-2">
                              This incident was classified as a false positive. All public alerts have been retracted and emergency resources released.
                            </p>
                            {rollback?.steps?.length > 0 && (
                              <ul className="space-y-1">
                                {rollback.steps.map((s: string, i: number) => (
                                  <li key={i} className="text-[9px] text-red-300/60 flex gap-1.5">
                                    <span className="text-red-400">✓</span>{s}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </motion.div>
                        )}

                        {/* Severity prediction */}
                        {sev && (
                          <div className="bg-orange-500/[0.08] border border-orange-500/20 rounded-xl p-4">
                            <h3 className="text-[9px] font-black uppercase tracking-widest text-orange-400 mb-3">Severity Prediction</h3>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {sev.spreadRisk    && <div><span className="text-white/30">Spread Risk: </span><span className="text-white/80 font-bold">{sev.spreadRisk}</span></div>}
                              {sev.timeToWorsen  && <div><span className="text-white/30">Time to Worsen: </span><span className="text-white/80 font-bold">{sev.timeToWorsen}</span></div>}
                              {sev.estimatedCasualties !== undefined && (
                                <div className="col-span-2"><span className="text-white/30">Est. Casualties: </span><span className="text-red-400 font-bold">{sev.estimatedCasualties}</span></div>
                              )}
                              {sev.escalationTriggers?.length > 0 && (
                                <div className="col-span-2">
                                  <p className="text-white/30 mb-1">Escalation Triggers:</p>
                                  {sev.escalationTriggers.map((t: string, i: number) => (
                                    <p key={i} className="text-orange-300/80 flex gap-1.5 text-[10px]">
                                      <span className="text-orange-500">›</span>{t}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {!msgs ? (
                          <div className="flex flex-col items-center gap-3 py-10 text-white/20">
                            <MessageSquare className="w-8 h-8 opacity-30" />
                            <p className="text-xs">No stakeholder messages yet</p>
                          </div>
                        ) : (
                          <>
                            {/* ── Public Alert ── */}
                            {msgs.public && (() => {
                              const ch = msgs.public;
                              const charCount = (ch.message ?? "").length;
                              return (
                                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                                  className="rounded-xl border p-4 text-cyan-400 bg-cyan-500/[0.08] border-cyan-500/20">
                                  <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-[9px] font-black uppercase tracking-widest">Public Alert</h3>
                                    <span className={cn(
                                      "text-[8px] font-black px-1.5 py-0.5 rounded border",
                                      charCount <= 160
                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                        : "bg-red-500/10 text-red-400 border-red-500/20"
                                    )}>
                                      {charCount}/160 SMS
                                    </span>
                                  </div>
                                  {ch.message && <p className="text-xs text-white/70 leading-relaxed mb-2 font-mono">{ch.message}</p>}
                                  <div className="flex gap-3 flex-wrap">
                                    {ch.channel     && <p className="text-[9px] text-white/30">Via: <span className="font-bold text-white/50">{ch.channel}</span></p>}
                                    {ch.urgencyLevel && <p className="text-[9px] text-white/30">Level: <span className="font-bold text-cyan-400">{ch.urgencyLevel}</span></p>}
                                  </div>
                                </motion.div>
                              );
                            })()}

                            {/* ── Hospital Notification ── */}
                            {msgs.hospitals && (() => {
                              const ch = msgs.hospitals;
                              return (
                                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                                  className="rounded-xl border p-4 text-emerald-400 bg-emerald-500/[0.08] border-emerald-500/20">
                                  <h3 className="text-[9px] font-black uppercase tracking-widest mb-2">Hospital Notification</h3>
                                  {ch.subject  && <p className="text-[9px] text-emerald-300/70 font-bold mb-1.5">{ch.subject}</p>}
                                  {ch.message  && <p className="text-xs text-white/70 leading-relaxed mb-2">{ch.message}</p>}
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {ch.channel        && <p className="text-[9px] text-white/30">Via: <span className="font-bold text-white/50">{ch.channel}</span></p>}
                                    {ch.bedsRequested  != null && <p className="text-[9px] text-white/30">Beds: <span className="font-bold text-emerald-400">{ch.bedsRequested}</span></p>}
                                    {ch.traumaProtocol && <p className="text-[9px] text-white/30 col-span-2">Trauma: <span className="font-bold text-white/60 uppercase">{ch.traumaProtocol}</span></p>}
                                    {ch.recipients     && <p className="text-[9px] text-white/30 col-span-2">To: {Array.isArray(ch.recipients) ? ch.recipients.join(", ") : ch.recipients}</p>}
                                  </div>
                                </motion.div>
                              );
                            })()}

                            {/* ── Police Dispatch ── */}
                            {msgs.police && (() => {
                              const ch = msgs.police;
                              return (
                                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                                  className="rounded-xl border p-4 text-blue-400 bg-blue-500/[0.08] border-blue-500/20">
                                  <div className="flex items-center gap-2 mb-2">
                                    <h3 className="text-[9px] font-black uppercase tracking-widest">Police Dispatch</h3>
                                    {ch.priorityCode && (
                                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded border bg-blue-500/20 text-blue-300 border-blue-500/30 uppercase">
                                        {ch.priorityCode}
                                      </span>
                                    )}
                                  </div>
                                  {ch.message && <p className="text-xs text-white/70 leading-relaxed mb-2 font-mono">{ch.message}</p>}
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {ch.unitsRequested != null && <p className="text-[9px] text-white/30">Units: <span className="font-bold text-blue-300">{ch.unitsRequested}</span></p>}
                                    {ch.priorityCode   && <p className="text-[9px] text-white/30">Code: <span className="font-bold text-blue-300">{ch.priorityCode}</span></p>}
                                    {ch.gridReference  && <p className="text-[9px] text-white/30 col-span-2">Grid Ref: <span className="font-bold text-blue-200">{ch.gridReference}</span></p>}
                                    {ch.channel        && <p className="text-[9px] text-white/30 col-span-2">Via: <span className="font-bold text-white/50">{ch.channel}</span></p>}
                                  </div>
                                </motion.div>
                              );
                            })()}

                            {/* ── Media Statement ── */}
                            {msgs.media && (() => {
                              const ch = msgs.media;
                              return (
                                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                                  className="rounded-xl border p-4 text-purple-400 bg-purple-500/[0.08] border-purple-500/20">
                                  <h3 className="text-[9px] font-black uppercase tracking-widest mb-2">Media Statement</h3>
                                  {ch.headline  && <p className="text-xs text-purple-300 font-bold leading-snug mb-1.5">{ch.headline}</p>}
                                  {ch.statement && <p className="text-xs text-white/60 leading-relaxed mb-2">{ch.statement}</p>}
                                  {/* Fallback: some agents may return .message instead of .statement */}
                                  {!ch.statement && ch.message && <p className="text-xs text-white/60 leading-relaxed mb-2">{ch.message}</p>}
                                  {ch.channel   && <p className="text-[9px] text-white/30">Via: <span className="font-bold text-white/50">{ch.channel}</span></p>}
                                </motion.div>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    );
                  })()}

                  {/* BAND ROOM */}
                  {tab === "band" && (
                    <div className="space-y-3">
                      {/* SEV badge */}
                      {(selected as any).sevLevel && (
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-wider ${
                          (selected as any).sevLevel === 'SEV-1' ? 'bg-red-500/10 border-red-500/30 text-red-400'
                          : (selected as any).sevLevel === 'SEV-2' ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                          : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        }`}>
                          <Shield className="w-3.5 h-3.5" />
                          {(selected as any).sevLevel}
                          {(selected as any).slaBreachRisk?.breachImminentIn && (
                            <span className="text-white/40 font-normal normal-case">
                              · SLA breach in {(selected as any).slaBreachRisk.breachImminentIn}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Approval pending indicator */}
                      {(selected as any).metadata?.requiresHumanApproval && !(selected as any).approvedBy && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.97 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="bg-orange-500/10 border border-orange-500/40 rounded-xl p-3"
                        >
                          <p className="text-[9px] font-black uppercase tracking-widest text-orange-400 mb-1">
                            ⚠ Awaiting Human Approval
                          </p>
                          <p className="text-[10px] text-orange-300/70 leading-relaxed">
                            A high-stakes action requires your approval before proceeding.
                            Review the proposal in the timeline below and Approve or Veto.
                          </p>
                        </motion.div>
                      )}

                      {/* Blast radius */}
                      {(selected as any).blastRadius && (
                        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3 grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-[8px] text-white/30 uppercase tracking-wider font-black mb-0.5">Customers</p>
                            <p className="text-sm font-black text-red-400">
                              {((selected as any).blastRadius.estimatedCustomersAffected ?? 0).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-[8px] text-white/30 uppercase tracking-wider font-black mb-0.5">Services</p>
                            <p className="text-sm font-black text-orange-400">
                              {(selected as any).blastRadius.estimatedServicesAffected ?? 0}
                            </p>
                          </div>
                          {(selected as any).blastRadius.cascadeRisk && (
                            <div className="col-span-2">
                              <p className="text-[8px] text-white/30 uppercase tracking-wider font-black mb-0.5">Cascade Risk</p>
                              <p className="text-xs font-bold text-white/70">{(selected as any).blastRadius.cascadeRisk}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Band Room Timeline */}
                      <BandRoomTimeline
                        incidentId={selected.incidentId}
                        onApprove={() => flash("✓ Action approved — response proceeding")}
                        onVeto={() => flash("✕ Action vetoed — logged in audit trail")}
                      />
                    </div>
                  )}

                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state when no incident selected */}
      {!selected && (
        <div className="w-[380px] flex-shrink-0 hidden lg:flex flex-col items-center justify-center bg-[#0d1117] border-l border-white/[0.08] text-white/15">
          <ChevronRight className="w-10 h-10 mb-3 opacity-20" />
          <p className="text-sm font-bold">Select an incident</p>
          <p className="text-[10px] mt-1 opacity-50">Choose from the queue or map</p>
        </div>
      )}
    </div>
  );
}
