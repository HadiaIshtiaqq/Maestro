import { useState } from "react";
import { APIProvider, Map, AdvancedMarker } from "@vis.gl/react-google-maps";
import { Layers } from "lucide-react";
import type { LiveIncident } from "../hooks/useLiveIncidents";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...i: ClassValue[]) { return twMerge(clsx(i)); }

import { getGoogleMapsApiKey } from "../lib/googleMaps";

const GMAPS_KEY = getGoogleMapsApiKey();

export const SEVERITY_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#3b82f6",
  low:      "#6b7280",
};

const LAYERS_CFG = [
  { section: "CORE", items: [
    { id: "incidents",  label: "Incidents",     on: true  },
    { id: "responders", label: "Responders",    on: false },
    { id: "clusters",   label: "Clusters",      on: false },
  ]},
  { section: "DISASTER", items: [
    { id: "heatmap",        label: "Heatmap",        on: false },
    { id: "disaster_zones", label: "Disaster zones",  on: false },
  ]},
];

interface Props {
  incidents: LiveIncident[];
  selectedId?: string | null;
  onSelect: (inc: LiveIncident) => void;
}

export default function CommandMap({ incidents, selectedId, onSelect }: Props) {
  const [layers, setLayers] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    LAYERS_CFG.forEach(g => g.items.forEach(i => { m[i.id] = i.on; }));
    return m;
  });
  const toggle = (id: string) => setLayers(p => ({ ...p, [id]: !p[id] }));

  const valid = incidents.filter(i => i.location?.lat && i.location?.lng && i.status !== "retracted");
  const center = valid.length
    ? { lat: valid.reduce((s, i) => s + i.location.lat, 0) / valid.length,
        lng: valid.reduce((s, i) => s + i.location.lng, 0) / valid.length }
    : { lat: 25, lng: 10 };
  const cmdZoom = valid.length <= 1 ? 4 : 2;

  return (
    <div className="relative w-full h-full">
      {GMAPS_KEY ? (
        <APIProvider apiKey={GMAPS_KEY}>
          <Map
            mapId="maestro-cmd"
            defaultCenter={center}
            defaultZoom={cmdZoom}
            disableDefaultUI
            clickableIcons={false}
            colorScheme="DARK"
            style={{ width: "100%", height: "100%" }}
          >
            {layers.incidents && valid.map(inc => {
              const c = SEVERITY_COLOR[inc.severity] ?? "#6b7280";
              const sel = inc.incidentId === selectedId;
              return (
                <AdvancedMarker
                  key={inc.incidentId}
                  position={{ lat: inc.location.lat, lng: inc.location.lng }}
                  onClick={() => onSelect(inc)}
                >
                  <div style={{
                    width:  sel ? 22 : 13, height: sel ? 22 : 13,
                    borderRadius: "50%",   background: c,
                    border: sel ? "3px solid #fff" : "2px solid rgba(255,255,255,0.3)",
                    boxShadow: `0 0 ${sel ? 20 : 8}px ${c}bb`,
                    cursor: "pointer",     transition: "all .15s",
                  }} />
                </AdvancedMarker>
              );
            })}
          </Map>
        </APIProvider>
      ) : (
        <FallbackMap incidents={valid} selectedId={selectedId} onSelect={onSelect} />
      )}

      {/* Layer controls panel */}
      <div className="absolute top-3 right-3 z-20 bg-black/85 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl" style={{ minWidth: 188 }}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-on-surface-variant" />
            <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">LAYERS</span>
          </div>
          <span className="text-[8px] font-black bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded">PHASE II</span>
        </div>
        {LAYERS_CFG.map(grp => (
          <div key={grp.section}>
            <div className="px-3 py-1 text-[8px] font-black uppercase tracking-[.15em] text-white/25 border-b border-white/5">{grp.section}</div>
            {grp.items.map(item => (
              <button key={item.id} onClick={() => toggle(item.id)}
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-white/5 transition-colors">
                <span className="text-[11px] text-on-surface-variant">
                  {item.id === "incidents" ? `${item.label} (${valid.length})` : item.label}
                </span>
                <span className={cn("text-[8px] font-black px-1.5 py-0.5 rounded border",
                  layers[item.id]
                    ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
                    : "bg-white/5 text-white/30 border-white/10")}>
                  {layers[item.id] ? "ON" : "OFF"}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function FallbackMap({ incidents, selectedId, onSelect }: Props) {
  const LAT = { min: 33.55, max: 33.82 };
  const LNG = { min: 72.90, max: 73.20 };
  return (
    <div className="w-full h-full bg-[#0d1117] relative overflow-hidden">
      <div className="absolute inset-0" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)",
        backgroundSize: "60px 60px",
      }} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(6,182,212,0.06)_0%,transparent_65%)]" />
      {incidents.map(inc => {
        const x = ((inc.location.lng - LNG.min) / (LNG.max - LNG.min)) * 100;
        const y = (1 - (inc.location.lat - LAT.min) / (LAT.max - LAT.min)) * 100;
        const c = SEVERITY_COLOR[inc.severity] ?? "#6b7280";
        const sel = inc.incidentId === selectedId;
        return (
          <button key={inc.incidentId} onClick={() => onSelect(inc)}
            className="absolute" style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)" }}>
            {sel && (
              <div style={{ position: "absolute", width: 30, height: 30, borderRadius: "50%",
                background: c + "22", top: -8, left: -8 }}
                className="animate-ping" />
            )}
            <div style={{
              width: sel ? 20 : 12, height: sel ? 20 : 12, borderRadius: "50%", background: c,
              border: sel ? "3px solid #fff" : "2px solid rgba(255,255,255,0.3)",
              boxShadow: `0 0 ${sel ? 16 : 7}px ${c}`, transition: "all .15s", position: "relative",
            }} />
          </button>
        );
      })}
      {incidents.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/15">No active incidents on map</p>
        </div>
      )}
    </div>
  );
}
