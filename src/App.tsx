import { useState, useEffect, useRef } from "react";
import TopBar, { type AppMode, type AppPersona } from "./components/TopBar";
import IntelligenceView from "./components/IntelligenceView";
import TacticalMapView from "./components/TacticalMapView";
import LogicTraceView from "./components/LogicTraceView";
import SimulationsView from "./components/SimulationsView";
import IncidentCommandView from "./components/IncidentCommandView";
import IncidentReportingView from "./components/IncidentReportingView";
import { useLiveIncidents } from "./hooks/useLiveIncidents";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, X, Zap } from "lucide-react";

interface EmergencyAlert {
  id: string;
  description: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
}

export default function App() {
  const [loading, setLoading]         = useState(true);
  const [activeAlert, setActiveAlert] = useState<EmergencyAlert | null>(null);
  const [activeView, setActiveView]   = useState("command");
  const [mode, setMode]               = useState<AppMode>("all");
  const [persona, setPersona]         = useState<AppPersona>("operator");

  const { incidents, resources, latestTrace, newestId, autonomousActions, refresh } = useLiveIncidents();
  const prevNewestRef = useRef<string | null>(null);

  // Boot sequence
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(t);
  }, []);

  // Alert banner on new critical/high incidents
  useEffect(() => {
    if (!newestId || newestId === prevNewestRef.current) return;
    prevNewestRef.current = newestId;
    const inc = incidents.find(i => i.incidentId === newestId);
    if (!inc) return;
    if (inc.severity === "critical" || inc.severity === "high") {
      setActiveAlert({
        id: inc.incidentId,
        description: `${inc.type?.toUpperCase()} · ${(inc as any).sevLevel ?? inc.severity?.toUpperCase()} · ${Math.round((inc.confidence ?? 0) * 100)}% confidence${(inc as any).blastRadius ? ` · blast radius: ${(inc as any).blastRadius}` : ""}`,
        severity: inc.severity === "critical" ? "CRITICAL" : "HIGH",
      });
    }
  }, [newestId, incidents]);

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0d1117] select-none overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.08)_0%,transparent_60%)]" />
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="relative flex flex-col items-center z-10 px-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(6,182,212,0.4)]">
            <Zap className="w-8 h-8 text-white fill-current" />
          </div>
          <div className="text-5xl font-black tracking-tighter text-white mb-2">Maestro</div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-white/30 font-bold mb-8">Enterprise Incident Response · Coordinated through Band</div>
          <div className="w-72 h-1 bg-white/5 rounded-full overflow-hidden">
            <motion.div initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 2, ease: "easeInOut" }}
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_20px_#06b6d4]" />
          </div>
          <div className="space-y-1 mt-6 text-[9px] uppercase tracking-[0.4em] font-bold opacity-30 text-center text-white">
            <p>Booting multi-agent core...</p>
            <p>Connecting to Band rooms...</p>
            <p>Initializing 11 agents across 4 frameworks...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  const criticalCount = incidents.filter(i => i.severity === "critical").length;

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] text-white overflow-hidden">

      {/* ── Critical incident banner ─────────────────────────────────────────── */}
      <AnimatePresence>
        {activeAlert && (
          <motion.div initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -80, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[100] flex justify-center p-2 pointer-events-none">
            <div className="w-full max-w-4xl bg-red-700/95 backdrop-blur-xl border border-red-500/40 rounded-2xl shadow-2xl p-3 flex items-center gap-4 pointer-events-auto">
              <div className="bg-white/20 p-2 rounded-xl flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="bg-white text-red-700 text-[8px] font-black px-2 py-0.5 rounded-full tracking-widest uppercase">{activeAlert.severity}</span>
                  <span className="text-[8px] text-white/50 font-bold uppercase tracking-wider">AI Agent Confirmed</span>
                </div>
                <p className="text-white text-xs font-bold leading-relaxed truncate">{activeAlert.description}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => { setActiveAlert(null); setActiveView("command"); }}
                  className="bg-white/20 hover:bg-white/30 px-4 py-1.5 rounded-lg border border-white/20 text-white font-bold text-xs uppercase transition-all">
                  View
                </button>
                <button onClick={() => setActiveAlert(null)} className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TopBar ──────────────────────────────────────────────────────────── */}
      <TopBar
        mode={mode}       setMode={setMode}
        persona={persona} setPersona={setPersona}
        activeView={activeView} onViewChange={setActiveView}
        incidentCount={incidents.length}
        criticalCount={criticalCount}
        resources={resources}
        onRefresh={refresh}
      />

      {/* ── Main content area ───────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden min-h-0">
        <AnimatePresence mode="wait">
          <motion.div key={activeView}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="h-full w-full">

            {activeView === "command" && (
              <IncidentCommandView incidents={incidents} mode={mode} onRefresh={refresh} />
            )}

            {activeView !== "command" && (
              <div className="h-full flex overflow-hidden">
                {/* Compact side nav for non-command views */}
                <div className="w-48 flex-shrink-0 bg-[#0d1117] border-r border-white/8 flex flex-col p-3 gap-1">
                  {[
                    { id: "intelligence", label: "Intelligence"  },
                    { id: "tactical",     label: "Tactical Map"  },
                    { id: "trace",        label: "Logic Trace"   },
                    { id: "simulations",  label: "Simulations"   },
                    { id: "reporting",    label: "Reporting"     },
                    { id: "command",      label: "← Command"     },
                  ].map(v => (
                    <button key={v.id} onClick={() => setActiveView(v.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                        activeView === v.id ? "bg-cyan-500/15 text-cyan-400" : "text-white/30 hover:bg-white/5 hover:text-white"
                      }`}>
                      {v.label}
                    </button>
                  ))}
                </div>

                {/* View content */}
                <div className="flex-1 overflow-auto p-4 min-h-0">
                  {activeView === "intelligence" && <IntelligenceView incidents={incidents} resources={resources} autonomousActions={autonomousActions} />}
                  {activeView === "tactical"     && <TacticalMapView incidents={incidents} />}
                  {activeView === "trace"        && <LogicTraceView  incidents={incidents} latestTrace={latestTrace} />}
                  {activeView === "simulations"  && <SimulationsView incidents={incidents} />}
                  {activeView === "reporting"    && <IncidentReportingView />}
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </main>

      {/* Maestro footer watermark */}
      <div className="fixed bottom-4 right-4 pointer-events-none flex items-center gap-1.5 opacity-20">
        <div className="flex gap-0.5">
          {[1,2,3,4,5,6].map(i => (
            <motion.div key={i}
              animate={{ height: [3, 14, 3], opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.4, delay: i * 0.18, repeat: Infinity }}
              className="w-[2px] bg-cyan-400 rounded-full"
            />
          ))}
        </div>
        <span className="font-mono text-[8px] uppercase tracking-[0.4em] font-black text-cyan-400">Band · Multi-Agent</span>
      </div>
    </div>
  );
}
