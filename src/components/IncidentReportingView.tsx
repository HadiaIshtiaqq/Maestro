import React, { useState } from "react";
import { Send, AlertCircle, CheckCircle2, FileText, Server, ShieldAlert, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

const INCIDENT_TYPES = [
  { value: "security_breach",  label: "Security Breach" },
  { value: "service_outage",   label: "Service Outage" },
  { value: "data_integrity",   label: "Data Integrity" },
  { value: "performance",      label: "Performance Degradation" },
  { value: "ddos_suspected",   label: "DDoS / Abuse" },
  { value: "compliance_event", label: "Compliance Event" },
  { value: "other",            label: "Other" },
];

const SOURCES = [
  { value: "siem",       label: "SIEM" },
  { value: "monitoring", label: "Monitoring" },
  { value: "ticket",     label: "Ticket / Human" },
  { value: "pagerduty",  label: "PagerDuty" },
];

interface SubmissionResult {
  incidentId?: string;
  severity?: string;
  sevLevel?: string;
  confidence?: number;
  type?: string;
  message?: string;
}

export default function IncidentReportingView() {
  const [incidentType, setIncidentType] = useState(INCIDENT_TYPES[0].value);
  const [source, setSource]   = useState(SOURCES[0].value);
  const [service, setService] = useState("");
  const [severity, setSeverity] = useState("auto");
  const [report, setReport] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmissionResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report.trim()) return;
    setIsSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ingest-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "call",
          type: "manual_report",
          data: {
            text: report,
            reportedType: incidentType,
            reportedSource: source,
            affectedService: service || undefined,
            requestedSeverity: severity !== "auto" ? severity : undefined,
            submittedVia: "IncidentReportingView",
          },
          urgency: severity === "critical" ? 10 : severity === "high" ? 8 : 6,
        }),
      });
      const json = await res.json();
      const inc = json.incident;
      setResult({
        incidentId: inc?.incidentId,
        severity: inc?.severity,
        sevLevel: inc?.sevLevel,
        confidence: inc?.confidence,
        type: inc?.type,
        message: json.message,
      });
      setSubmitted(true);
      setReport("");
      setService("");
      setTimeout(() => { setSubmitted(false); setResult(null); }, 12000);
    } catch (err: any) {
      setError(`Submission failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0c10] text-[#e0e0e0] p-4 md:p-8 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8 mt-2">
        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
          <ShieldAlert className="w-6 h-6 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tighter text-white uppercase">
            Report an <span className="text-cyan-400">Incident</span>
          </h1>
          <p className="text-[10px] md:text-xs font-bold text-white/40 uppercase tracking-[0.3em]">
            Manual intake · routed through the agent pipeline + Band room
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-5xl">
        {/* Form */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-5 bg-white/[0.03] border border-white/10 rounded-3xl p-6 md:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 block">Incident Type</label>
              <select value={incidentType} onChange={e => setIncidentType(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 focus:outline-none focus:border-cyan-500/50">
                {INCIDENT_TYPES.map(t => <option key={t.value} value={t.value} className="bg-[#0a0c10]">{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 block">Source</label>
              <select value={source} onChange={e => setSource(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 focus:outline-none focus:border-cyan-500/50">
                {SOURCES.map(s => <option key={s.value} value={s.value} className="bg-[#0a0c10]">{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 block">Affected Service</label>
              <div className="relative">
                <Server className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={service} onChange={e => setService(e.target.value)} placeholder="e.g. payments-api"
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-cyan-500/50" />
              </div>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 block">Severity</label>
              <select value={severity} onChange={e => setSeverity(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 focus:outline-none focus:border-cyan-500/50">
                <option value="auto" className="bg-[#0a0c10]">Auto (let agents assess)</option>
                <option value="critical" className="bg-[#0a0c10]">Critical (SEV-1)</option>
                <option value="high" className="bg-[#0a0c10]">High (SEV-2)</option>
                <option value="medium" className="bg-[#0a0c10]">Medium (SEV-3)</option>
                <option value="low" className="bg-[#0a0c10]">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-2 block">Description</label>
            <textarea value={report} onChange={e => setReport(e.target.value)}
              placeholder="What's happening? Symptoms, affected systems, error rates, timeline…"
              className="w-full h-40 bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white/80 placeholder:text-white/20 focus:outline-none focus:border-cyan-500/50 resize-none leading-relaxed" />
          </div>

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          <AnimatePresence>
            {submitted && (
              <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="p-5 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl text-cyan-300 space-y-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-7 h-7 shrink-0" />
                  <div>
                    <h4 className="text-sm font-black uppercase">Incident Created</h4>
                    <p className="text-[10px] font-bold text-cyan-400/60 uppercase tracking-widest mt-0.5">
                      {result?.incidentId ? `ID ${result.incidentId.slice(0, 8)}… · now on the dashboard + Band room` : result?.message}
                    </p>
                  </div>
                </div>
                {result && (
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-cyan-500/10">
                    {result.type && <div className="bg-black/30 rounded-xl p-3"><p className="text-[8px] font-black uppercase text-cyan-400/40 mb-1">Type</p><p className="text-xs font-black text-white">{result.type}</p></div>}
                    {(result.sevLevel || result.severity) && <div className="bg-black/30 rounded-xl p-3"><p className="text-[8px] font-black uppercase text-cyan-400/40 mb-1">Severity</p><p className="text-xs font-black text-white uppercase">{result.sevLevel ?? result.severity}</p></div>}
                    {result.confidence !== undefined && <div className="bg-black/30 rounded-xl p-3"><p className="text-[8px] font-black uppercase text-cyan-400/40 mb-1">Confidence</p><p className="text-xs font-black text-white">{Math.round((result.confidence ?? 0) * 100)}%</p></div>}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <button disabled={!report.trim() || isSubmitting}
            className={cn("w-full py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all flex items-center justify-center gap-3",
              !report.trim() || isSubmitting ? "bg-white/5 text-white/20 cursor-not-allowed border border-white/5"
                : "bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-lg hover:shadow-cyan-500/30 active:scale-[0.98]")}>
            {isSubmitting ? (<><Loader2 className="w-4 h-4 animate-spin" />Submitting…</>) : (<><Send className="w-4 h-4" />Submit Incident</>)}
          </button>
        </form>

        {/* Sidebar */}
        <div className="space-y-5">
          <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <FileText className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-black tracking-tight text-white/90 uppercase">What happens next</h3>
            </div>
            <div className="space-y-5">
              {[
                ["1", "Intake & correlation", "Your report is normalized and checked against open incidents (dedup)."],
                ["2", "Agent triage", "11 agents across 4 frameworks assess credibility, severity, and blast radius."],
                ["3", "Band room", "Findings post to a live Band room; SEV-1/SEV-2 require human approval."],
              ].map(([n, t, d]) => (
                <div key={n} className="flex gap-4">
                  <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-cyan-400 font-black text-xs border border-white/10">{n}</div>
                  <div>
                    <h4 className="text-[11px] font-black text-white uppercase mb-1">{t}</h4>
                    <p className="text-[10px] text-white/40 leading-relaxed">{d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
