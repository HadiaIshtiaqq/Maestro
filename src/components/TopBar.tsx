import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown, RefreshCw, Bell, BrainCircuit, Map as MapIcon,
  Activity, Cpu, ShieldAlert, HelpCircle, Zap, AlertTriangle,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...i: ClassValue[]) { return twMerge(clsx(i)); }

export type AppMode    = "all" | "normal" | "disaster" | "world_cup";
export type AppPersona = "operator" | "dispatcher" | "executive";

interface TopBarProps {
  mode:       AppMode;
  setMode:    (m: AppMode) => void;
  persona:    AppPersona;
  setPersona: (p: AppPersona) => void;
  activeView: string;
  onViewChange: (v: string) => void;
  incidentCount?: number;
  criticalCount?: number;
  resources?: { pool?: Record<string, number>; available?: Record<string, number> };
  onRefresh?: () => void;
}

const PERSONAS: { value: AppPersona; label: string }[] = [
  { value: "operator",   label: "Operator / Dispatcher" },
  { value: "dispatcher", label: "Field Dispatcher"      },
  { value: "executive",  label: "Executive View"        },
];

const MODES: { value: AppMode; label: string; cls: string; activeClass: string }[] = [
  { value: "all",       label: "All",       cls: "", activeClass: "bg-white/15 text-white"             },
  { value: "normal",    label: "Normal",    cls: "", activeClass: "bg-emerald-700/40 text-emerald-300" },
  { value: "disaster",  label: "Disaster",  cls: "", activeClass: "bg-red-700/50 text-red-300"         },
  { value: "world_cup", label: "World Cup", cls: "", activeClass: "bg-yellow-700/40 text-yellow-300"   },
];

const NAV_VIEWS = [
  { id: "intelligence", label: "Intelligence", Icon: BrainCircuit },
  { id: "tactical",     label: "Tactical Map", Icon: MapIcon      },
  { id: "trace",        label: "Logic Trace",  Icon: Activity     },
  { id: "simulations",  label: "Simulations",  Icon: Cpu          },
  { id: "command",      label: "Command",      Icon: ShieldAlert  },
  { id: "reporting",    label: "Reporting",    Icon: HelpCircle   },
];

export default function TopBar({
  mode, setMode, persona, setPersona,
  activeView, onViewChange,
  incidentCount = 0, criticalCount = 0,
  resources, onRefresh,
}: TopBarProps) {
  const [personaOpen,   setPersonaOpen]   = useState(false);
  const [viewOpen,      setViewOpen]      = useState(false);
  const [showNotif,     setShowNotif]     = useState(false);
  const [refreshSpin,   setRefreshSpin]   = useState(false);

  const pool  = resources?.pool      ?? {};
  const avail = resources?.available ?? {};
  const totalPool     = Object.values(pool).reduce((s, v) => s + v, 0);
  const totalDeployed = Object.keys(pool).reduce((s, k) => s + ((pool[k] ?? 0) - (avail[k] ?? 0)), 0);
  const operatorLoad  = totalPool > 0 ? Math.round((totalDeployed / totalPool) * 100) : 0;

  const handleRefresh = () => {
    setRefreshSpin(true);
    onRefresh?.();
    setTimeout(() => setRefreshSpin(false), 800);
  };

  return (
    <header className="flex-shrink-0 h-12 flex items-center px-3 gap-2 bg-[#0d1117] border-b border-white/[0.08] z-40 relative overflow-visible">

      {/* Branding */}
      <div className="flex items-center gap-2 mr-1">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
          <Zap className="w-3.5 h-3.5 text-white fill-current" />
        </div>
        <div className="hidden sm:block">
          <div className="font-black text-sm text-white tracking-tight leading-none">Maestro</div>
          <div className="text-[7px] font-bold uppercase tracking-[.15em] text-white/25 leading-none mt-0.5">Command Center</div>
        </div>
      </div>

      <div className="w-px h-6 bg-white/8 flex-shrink-0" />

      {/* Persona dropdown */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => { setPersonaOpen(p => !p); setViewOpen(false); setShowNotif(false); }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs font-bold hover:bg-white/10 transition-all"
        >
          <span className="text-white/50 text-[9px] font-bold uppercase tracking-wider hidden md:inline">Persona</span>
          <span className="text-[11px] font-bold text-white/80 max-w-[120px] truncate">{PERSONAS.find(p => p.value === persona)?.label}</span>
          <ChevronDown className={cn("w-3 h-3 text-white/40 transition-transform", personaOpen && "rotate-180")} />
        </button>
        <AnimatePresence>
          {personaOpen && (
            <motion.div initial={{ opacity: 0, y: 4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.97 }}
              className="absolute left-0 top-9 bg-[#161b22] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 min-w-[180px]">
              {PERSONAS.map(p => (
                <button key={p.value} onClick={() => { setPersona(p.value); setPersonaOpen(false); }}
                  className={cn("w-full text-left px-4 py-2.5 text-xs font-bold transition-colors",
                    persona === p.value ? "text-cyan-400 bg-cyan-500/10" : "text-white/60 hover:bg-white/5 hover:text-white")}>
                  {p.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="w-px h-6 bg-white/8 flex-shrink-0" />

      {/* Mode tabs */}
      <div className="flex gap-0.5 bg-white/4 border border-white/8 rounded-lg p-0.5 flex-shrink-0">
        {MODES.map(m => (
          <button key={m.value} onClick={() => setMode(m.value)}
            className={cn("px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all",
              mode === m.value ? m.activeClass : "text-white/30 hover:text-white/60")}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="w-px h-6 bg-white/8 flex-shrink-0 hidden md:block" />

      {/* Stats */}
      <div className="hidden md:flex items-center gap-3">
        {/* Active calls */}
        <motion.div key={incidentCount} initial={{ scale: 0.9 }} animate={{ scale: 1 }}
          className="text-center leading-none">
          <div className="text-lg font-black text-white leading-none">{incidentCount}</div>
          <div className="text-[8px] font-black uppercase tracking-widest text-white/30 mt-0.5">Active Incidents</div>
        </motion.div>

        <div className="w-px h-8 bg-white/8" />

        {/* Critical */}
        <div className="text-center leading-none">
          <div className={cn("text-lg font-black leading-none", criticalCount > 0 ? "text-red-400" : "text-white/20")}>
            {criticalCount}
          </div>
          <div className="text-[8px] font-black uppercase tracking-widest text-white/30 mt-0.5">Critical</div>
        </div>

        <div className="w-px h-8 bg-white/8" />

        {/* Operator load */}
        <div className="leading-none">
          <div className="flex items-baseline gap-1">
            <span className={cn("text-lg font-black leading-none", operatorLoad > 70 ? "text-red-400" : operatorLoad > 40 ? "text-orange-400" : "text-white")}>
              {operatorLoad}%
            </span>
            <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Operator Load</span>
          </div>
          <div className="text-[8px] text-white/20 mt-0.5">
            {totalDeployed} units deployed / {totalPool} total
          </div>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Simulate buttons */}
      <div className="hidden lg:flex gap-1">
        <button
          onClick={async () => { try { await fetch("/api/simulate/disaster", { method: "POST" }); } catch {} }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-800/50 text-red-400 text-[9px] font-black uppercase tracking-wider hover:bg-red-900/30 transition-all">
          <AlertTriangle className="w-3 h-3" />Cascading Failure
        </button>
        <button
          onClick={async () => { try { await fetch("/api/simulate/world-cup", { method: "POST" }); } catch {} }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-yellow-800/50 text-yellow-400 text-[9px] font-black uppercase tracking-wider hover:bg-yellow-900/30 transition-all">
          ⚡ Peak Event
        </button>
      </div>

      <div className="w-px h-6 bg-white/8 flex-shrink-0" />

      {/* Refresh */}
      <button onClick={handleRefresh} title="Refresh incidents"
        className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-all">
        <RefreshCw className={cn("w-4 h-4 transition-transform", refreshSpin && "animate-spin")} />
      </button>

      {/* Notification bell */}
      <div className="relative">
        <button onClick={() => { setShowNotif(p => !p); setPersonaOpen(false); setViewOpen(false); }}
          className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-all relative">
          <Bell className="w-4 h-4" />
          {criticalCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-[#0d1117]" />
          )}
        </button>
        <AnimatePresence>
          {showNotif && (
            <motion.div initial={{ opacity: 0, y: 4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
              className="absolute right-0 top-10 w-72 bg-[#161b22] border border-white/10 rounded-2xl shadow-2xl p-4 z-50">
              <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Live Incidents</div>
              {incidentCount === 0
                ? <div className="text-xs text-white/30 py-3 text-center">All clear</div>
                : (
                  <div className="space-y-2">
                    <div className="text-xs text-white/60 font-bold">{incidentCount} active · {criticalCount} critical</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {Object.entries(pool).map(([k, v]) => {
                        const used = v - (avail[k] ?? 0);
                        const emoji = k === "sre" ? "🛠" : k === "seceng" ? "🔒" : k === "dataeng" ? "🗄" : k === "ic" ? "🎖" : k === "compliance" ? "📋" : "•";
                        return (
                          <div key={k} className="text-[9px] bg-white/5 border border-white/10 rounded-lg px-2 py-1">
                            {emoji} {used}/{v}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Views menu */}
      <div className="relative">
        <button
          onClick={() => { setViewOpen(p => !p); setPersonaOpen(false); setShowNotif(false); }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-wider hover:bg-white/10 hover:text-white transition-all">
          Views <ChevronDown className={cn("w-3 h-3 transition-transform", viewOpen && "rotate-180")} />
        </button>
        <AnimatePresence>
          {viewOpen && (
            <motion.div initial={{ opacity: 0, y: 4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
              className="absolute right-0 top-9 bg-[#161b22] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 min-w-[170px]">
              {NAV_VIEWS.map(v => (
                <button key={v.id} onClick={() => { onViewChange(v.id); setViewOpen(false); }}
                  className={cn("w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold transition-colors",
                    activeView === v.id ? "text-cyan-400 bg-cyan-500/10" : "text-white/50 hover:bg-white/5 hover:text-white")}>
                  <v.Icon className="w-3.5 h-3.5" />{v.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
