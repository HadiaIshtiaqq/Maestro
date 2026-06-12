import React, { useState, useEffect, useMemo } from "react";
import { AlertTriangle, Timer, Activity, TrendingUp, Play, CheckCircle2, Loader2, Info } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { APIProvider, Map, AdvancedMarker, Polyline, Circle } from "@vis.gl/react-google-maps";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const GMAPS_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ?? "";

// Karachi emergency route coordinates
const CONGESTED_ROUTE = [
  { lat: 24.8607, lng: 67.0152 }, // Civil Hospital
  { lat: 24.8680, lng: 67.0230 },
  { lat: 24.8760, lng: 67.0310 },
  { lat: 24.8850, lng: 67.0420 },
  { lat: 24.8950, lng: 67.0540 },
  { lat: 24.9056, lng: 67.0822 }, // Stadium
];

const OPTIMIZED_ROUTE = [
  { lat: 24.8607, lng: 67.0152 }, // Civil Hospital
  { lat: 24.8600, lng: 67.0000 },
  { lat: 24.8750, lng: 66.9950 },
  { lat: 24.9000, lng: 67.0200 },
  { lat: 24.9100, lng: 67.0600 },
  { lat: 24.9056, lng: 67.0822 }, // Stadium
];

const AMBULANCE_STATIONS = [
  { lat: 24.8607, lng: 67.0152, label: "Civil Hospital" },
  { lat: 24.8820, lng: 67.0180, label: "JPMC" },
  { lat: 24.8975, lng: 67.0826, label: "Aga Khan Hospital" },
];

const INCIDENT_CENTER = { lat: 24.9056, lng: 67.0822 };
const MAP_CENTER = { lat: 24.8830, lng: 67.0487 };

function AnimatedPolylineRoute({ path, color, animated }: { path: { lat: number; lng: number }[]; color: string; animated?: boolean }) {
  const [dashOffset, setDashOffset] = useState(0);

  useEffect(() => {
    if (!animated) return;
    const interval = setInterval(() => {
      setDashOffset(prev => (prev + 2) % 40);
    }, 60);
    return () => clearInterval(interval);
  }, [animated]);

  return (
    <Polyline
      path={path}
      strokeColor={color}
      strokeOpacity={animated ? 0.9 : 0.7}
      strokeWeight={animated ? 5 : 4}
      icons={animated ? [{
        icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 4 },
        offset: `${dashOffset}px`,
        repeat: "40px",
      }] : undefined}
    />
  );
}

const SCENARIOS = [
  {
    id: "disaster",
    title: "🔥 Cascading Failure — DC Power + DB + Exfil",
    description: "Fires a datacenter power failure, database replication failure, and suspected data exfiltration simultaneously. Tests multi-incident resource contention and triage under maximum load.",
    type: "CRITICAL",
    actionType: "DISASTER",
    endpoint: "/api/simulate/disaster",
    parameters: {},
  },
  {
    id: "world-cup",
    title: "⚡ Peak Event — Traffic Surge + DDoS",
    description: "Simulates a 14× peak-event traffic surge with a suspected volumetric DDoS riding it. Tests surge protocols and security/SRE coordination.",
    type: "HIGH",
    actionType: "PEAK_EVENT",
    endpoint: "/api/simulate/world-cup",
    parameters: {},
  },
  {
    id: "stress-test",
    title: "🛡 Stress Test — Breach + Outage",
    description: "Fires a credential-stuffing attack and a payments-API outage simultaneously. Demonstrates two Band rooms contending for the shared on-call pool, with reallocation visible in both rooms.",
    type: "HIGH",
    actionType: "STRESS_TEST",
    endpoint: "/api/simulate/stress-test",
    parameters: {},
  },
  {
    id: "false-positive",
    title: "🔍 False Positive Recovery",
    description: "Simulates a social media panic report that gets retracted after cross-validation. Tests agent correction and resource recall workflows.",
    type: "MEDIUM",
    actionType: "FALSE_POSITIVE",
    endpoint: "/api/simulate/false-positive",
    parameters: { incidentId: "SIM-FP-" + Date.now().toString().slice(-4), source: "social" },
  },
  {
    id: "scenario-1",
    title: "Scenario 1: Outage + Conflicting Signals",
    description: "Monitoring reports a database outage while the vendor status page claims all-clear. Tests agent cross-validation and conflict resolution.",
    type: "CRITICAL",
    actionType: "CROSS_VALIDATION",
    endpoint: "/api/simulate/action",
    parameters: {
      primaryEvent: "Database Outage",
      conflictingSource: "Vendor Status Page",
      discrepancyType: "Internal alerts vs vendor all-clear"
    }
  },
  {
    id: "scenario-2",
    title: "Scenario 2: Cascading Infrastructure Failure",
    description: "Power failure in the primary datacenter cascades to cooling and database clusters. Tests resource reallocation speed across dependent services.",
    type: "HIGH",
    actionType: "RESOURCE_REALLOCATION",
    endpoint: "/api/simulate/action",
    parameters: {
      primaryEvent: "Datacenter Power Failure",
      impactTarget: "Orders DB Cluster",
      cascadingEffect: "Cooling Failure"
    }
  }
];

export default function SimulationsView({ incidents = [] }: { incidents?: any[] }) {
  const [activeSimulation, setActiveSimulation] = useState<any | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  // Derive live map data from active incidents
  const activeIncidents = useMemo(
    () => incidents.filter(i => i.location?.lat && i.location?.lng && i.status !== "retracted"),
    [incidents]
  );

  const mapCenter = useMemo(() => {
    if (!activeIncidents.length) return MAP_CENTER;
    const lat = activeIncidents.reduce((s: number, i: any) => s + i.location.lat, 0) / activeIncidents.length;
    const lng = activeIncidents.reduce((s: number, i: any) => s + i.location.lng, 0) / activeIncidents.length;
    return { lat, lng };
  }, [activeIncidents]);

  const liveAlternateRoutes = useMemo(() =>
    activeIncidents.flatMap((i: any) =>
      (i.infrastructureRecommendations?.alternativeRoutes ?? [])
        .filter((r: any) => r.waypoints?.length >= 2)
    ),
    [activeIncidents]
  );

  const liveHospitals = useMemo(() =>
    activeIncidents.flatMap((i: any) => i.infrastructureRecommendations?.nearbyHospitals ?? []),
    [activeIncidents]
  );

  const normalizeSimResult = (data: any) => {
    if (data.actionTaken) return data;
    if (data.retractionPlan) {
      return {
        actionTaken: `Retraction executed. Rollback time: ${data.retractionPlan.estimatedRollbackTime ?? "—"}.`,
        metrics: {
          etaImprovement: data.retractionPlan.estimatedRollbackTime ?? "—",
          congestionImpact: `${(data.resourcesReleased?.ambulance ?? 0) + (data.resourcesReleased?.police ?? 0) + (data.resourcesReleased?.fire ?? 0) + (data.resourcesReleased?.drone ?? 0)} units recalled`,
        },
        afterState: data.antigravityTraceCorrection?.correctionNote ?? data.retractionPlan?.publicCommunication?.message ?? "Incident retracted — resources recalled.",
        sideEffects: data.retractionPlan?.immediateActions ?? [],
      };
    }
    if (data.incidents) {
      const incList = data.incidents as any[];
      return {
        actionTaken: `${data.scenario} — ${incList.length} concurrent incidents activated.`,
        metrics: {
          etaImprovement: `${incList.length} crisis nodes`,
          congestionImpact: `${Object.values((data.resources?.pool ?? {}) as Record<string, number>).reduce((s, v) => s + v, 0)} units`,
        },
        afterState: incList.map((i: any) => `${i.type ?? "incident"} (${Math.round((i.confidence ?? 0) * 100)}% conf)`).join(" · ") + " — All AI pipelines active.",
        sideEffects: incList.map((i: any) => `${i.type ?? "incident"}: ${i.allocatedResources?.ambulance ?? 0}🚑 ${i.allocatedResources?.police ?? 0}🚔 ${i.allocatedResources?.fire ?? 0}🚒 deployed`),
      };
    }
    if (data.results) {
      const incList = Object.values(data.results) as any[];
      return {
        actionTaken: `${data.scenario} — Multi-crisis resource contention demonstrated.`,
        metrics: {
          etaImprovement: `${incList.length} concurrent crises`,
          congestionImpact: `${Object.values((data.resourceContention?.pool ?? {}) as Record<string, number>).reduce((s, v) => s + v, 0)} total units`,
        },
        afterState: `Flood + Heatwave incidents triggered simultaneously. Resource contention model active across ${incList.length} sectors.`,
        sideEffects: incList.map((i: any) => `${i.type ?? "incident"}: ${Math.round((i.confidence ?? 0) * 100)}% conf · ${(i.allocatedResources?.ambulance ?? 0) + (i.allocatedResources?.police ?? 0) + (i.allocatedResources?.fire ?? 0)} units`),
      };
    }
    return {
      actionTaken: data.scenario ?? data.message ?? "Simulation complete",
      metrics: { etaImprovement: "—", congestionImpact: "—" },
      afterState: JSON.stringify(data).slice(0, 200),
      sideEffects: [],
    };
  };

  const runSimulation = async (scenario: typeof SCENARIOS[0]) => {
    setIsSimulating(true);
    setActiveSimulation(scenario);
    setResult(null);

    try {
      const body =
        scenario.id === "false-positive"
          ? {
              incidentId:    `SIM-FP-${Date.now().toString().slice(-4)}`,
              incidentType:  "social_media_panic",
              fieldReportId: `FR-${Date.now().toString().slice(-6)}`,
              alertsSent:    ["SMS", "WhatsApp", "PublicBroadcast"],
            }
          : scenario.id === "stress-test" || scenario.id === "disaster" || scenario.id === "world-cup"
          ? scenario.parameters
          : {
              incidentId:  `SIM-${Date.now().toString().slice(-4)}`,
              actionType:  scenario.actionType,
              parameters:  scenario.parameters,
            };

      const response = await fetch(scenario.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error("Simulation request failed");

      const data = await response.json();
      setResult(normalizeSimResult(data));
    } catch (error) {
      console.error("Simulation failed", error);
    } finally {
      setIsSimulating(false);
    }
  };
  return (
    <div className="flex flex-col gap-6 h-full animate-in fade-in duration-500 overflow-y-auto pb-20 lg:pb-0 lg:overflow-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <h1 className="text-2xl md:text-3xl font-black text-primary tracking-tight">SIMULATION <span className="text-tertiary/50">ENGINES</span></h1>
        <div className="bg-tertiary/20 px-3 py-1 border border-tertiary/30 rounded-full flex items-center gap-2">
          <span className="w-2 h-2 bg-tertiary rounded-full animate-pulse"></span>
          <span className="font-mono text-[10px] md:text-xs text-tertiary font-bold tracking-widest uppercase">Mode: Active</span>
        </div>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6 h-auto lg:h-[55%] shrink-0">
        {/* Current State */}
        <div className="bg-surface-container rounded-xl border border-white/5 relative overflow-hidden flex flex-col group min-h-[300px] lg:min-h-0">
          <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5 backdrop-blur-md">
            <span className="font-mono text-[9px] md:text-[10px] font-bold text-on-surface-variant uppercase tracking-widest truncate">
              {activeIncidents.length > 0 ? `Live: ${activeIncidents.length} Active Incident${activeIncidents.length > 1 ? "s" : ""}` : "Current Traffic State"}
            </span>
            <span className="font-mono text-[10px] md:text-xs text-error font-bold">STATUS: CONGESTED</span>
          </div>
          <div className="flex-1 relative min-h-[220px]">
            {GMAPS_KEY ? (
              <APIProvider apiKey={GMAPS_KEY}>
                <Map
                  mapId="sim-congested"
                  center={mapCenter}
                  zoom={activeIncidents.length ? 13 : 12}
                  disableDefaultUI
                  gestureHandling="none"
                  colorScheme="DARK"
                  style={{ width: "100%", height: "100%" }}
                >
                  {activeIncidents.length > 0 ? (
                    // Live incident data
                    <>
                      {activeIncidents.map((inc: any) => (
                        <React.Fragment key={inc.incidentId}>
                          <Circle
                            center={{ lat: inc.location.lat, lng: inc.location.lng }}
                            radius={inc.radius ?? 1000}
                            strokeColor="#ff3d3d" strokeOpacity={0.8} strokeWeight={2}
                            fillColor="#ff3d3d" fillOpacity={0.1}
                          />
                          <AdvancedMarker position={{ lat: inc.location.lat, lng: inc.location.lng }}>
                            <div className="w-5 h-5 rounded-full bg-red-500 border-2 border-white animate-pulse shadow-lg shadow-red-500/60" />
                          </AdvancedMarker>
                        </React.Fragment>
                      ))}
                      {/* Congested routes from AI recommendations */}
                      <AnimatedPolylineRoute path={CONGESTED_ROUTE} color="#ff3d3d" animated />
                    </>
                  ) : (
                    // Fallback static demo
                    <>
                      <AnimatedPolylineRoute path={CONGESTED_ROUTE} color="#ff3d3d" animated />
                      <Polyline path={[{ lat: 24.875, lng: 67.028 }, { lat: 24.880, lng: 67.035 }]} strokeColor="#ff6b6b" strokeOpacity={0.5} strokeWeight={3} />
                      <Polyline path={[{ lat: 24.890, lng: 67.048 }, { lat: 24.895, lng: 67.055 }]} strokeColor="#ff6b6b" strokeOpacity={0.5} strokeWeight={3} />
                      <AdvancedMarker position={INCIDENT_CENTER}>
                        <div className="w-5 h-5 rounded-full bg-red-500 border-2 border-white animate-pulse shadow-lg shadow-red-500/60" />
                      </AdvancedMarker>
                      {AMBULANCE_STATIONS.map((s, i) => (
                        <AdvancedMarker key={i} position={{ lat: s.lat, lng: s.lng }}>
                          <div className="text-[11px] px-1.5 py-0.5 bg-red-900/80 border border-red-500/50 rounded text-red-300 font-mono font-bold whitespace-nowrap">🚑 {s.label}</div>
                        </AdvancedMarker>
                      ))}
                    </>
                  )}
                </Map>
              </APIProvider>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-black/30 text-white/30 text-xs font-mono uppercase tracking-widest">
                Add VITE_GOOGLE_MAPS_API_KEY to .env
              </div>
            )}
            <div className="absolute inset-0 p-6 md:p-8 flex flex-col justify-end bg-gradient-to-t from-background via-background/40 to-transparent pointer-events-none">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl md:text-6xl font-black text-error">14.2</span>
                <span className="font-mono text-base md:text-lg text-error font-bold tracking-widest">MINS</span>
              </div>
              <p className="font-mono text-[10px] md:text-xs uppercase tracking-widest text-on-surface-variant mt-2">Average Response Time — Routes Blocked</p>
              <div className="mt-4 w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="w-[85%] h-full bg-error shadow-[0_0_10px_rgba(255,0,0,0.5)]"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Optimized State */}
        <div className="bg-surface-container rounded-xl border border-primary/30 relative overflow-hidden flex flex-col shadow-[0_0_30px_rgba(255,180,170,0.15)] group min-h-[300px] lg:min-h-0">
          <div className="p-4 border-b border-primary/20 flex justify-between items-center bg-primary/10 backdrop-blur-md">
            <span className="font-mono text-[9px] md:text-[10px] font-bold text-primary uppercase tracking-widest truncate">
              {liveAlternateRoutes.length > 0 ? `AI Alternate Routes (${liveAlternateRoutes.length})` : "Algorithmic Rerouting Active"}
            </span>
            <span className="font-mono text-[10px] md:text-xs text-secondary font-bold">PROJECTED SUCCESS: 94%</span>
          </div>
          <div className="flex-1 relative min-h-[220px]">
            {GMAPS_KEY ? (
              <APIProvider apiKey={GMAPS_KEY}>
                <Map
                  mapId="sim-optimized"
                  center={mapCenter}
                  zoom={activeIncidents.length ? 13 : 12}
                  disableDefaultUI
                  gestureHandling="none"
                  colorScheme="DARK"
                  style={{ width: "100%", height: "100%" }}
                >
                  {liveAlternateRoutes.length > 0 ? (
                    // Live AI-recommended alternate routes
                    <>
                      {activeIncidents.map((inc: any) => (
                        <React.Fragment key={inc.incidentId}>
                          <Circle
                            center={{ lat: inc.location.lat, lng: inc.location.lng }}
                            radius={inc.radius ?? 1000}
                            strokeColor="#00e5ff" strokeOpacity={0.5} strokeWeight={1}
                            fillColor="#00e5ff" fillOpacity={0.06}
                          />
                          <AdvancedMarker position={{ lat: inc.location.lat, lng: inc.location.lng }}>
                            <div className="w-5 h-5 rounded-full bg-cyan-400 border-2 border-white animate-pulse shadow-lg shadow-cyan-400/60" />
                          </AdvancedMarker>
                        </React.Fragment>
                      ))}
                      {liveAlternateRoutes.map((r: any, i: number) => (
                        <AnimatedPolylineRoute
                          key={r.id ?? i}
                          path={r.waypoints.map((w: any) => ({ lat: w.lat, lng: w.lng }))}
                          color={r.status === "clear" ? "#22c55e" : r.status === "congested" ? "#f97316" : "#00e5ff"}
                          animated
                        />
                      ))}
                      {liveHospitals.slice(0, 5).map((h: any, i: number) => (
                        <AdvancedMarker key={h.id ?? i} position={{ lat: h.lat, lng: h.lng }}>
                          <div className="text-[11px] px-1.5 py-0.5 bg-cyan-900/80 border border-cyan-400/50 rounded text-cyan-300 font-mono font-bold whitespace-nowrap">🏥 {h.name}</div>
                        </AdvancedMarker>
                      ))}
                    </>
                  ) : (
                    // Fallback static demo
                    <>
                      <AnimatedPolylineRoute path={OPTIMIZED_ROUTE} color="#00e5ff" animated />
                      <Polyline path={[{ lat: 24.870, lng: 66.997 }, { lat: 24.898, lng: 67.025 }]} strokeColor="#4ade80" strokeOpacity={0.7} strokeWeight={3} />
                      <AdvancedMarker position={INCIDENT_CENTER}>
                        <div className="w-5 h-5 rounded-full bg-cyan-400 border-2 border-white animate-pulse shadow-lg shadow-cyan-400/60" />
                      </AdvancedMarker>
                      {AMBULANCE_STATIONS.map((s, i) => (
                        <AdvancedMarker key={i} position={{ lat: s.lat, lng: s.lng }}>
                          <div className="text-[11px] px-1.5 py-0.5 bg-cyan-900/80 border border-cyan-400/50 rounded text-cyan-300 font-mono font-bold whitespace-nowrap">🚑 {s.label}</div>
                        </AdvancedMarker>
                      ))}
                    </>
                  )}
                </Map>
              </APIProvider>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-black/30 text-white/30 text-xs font-mono uppercase tracking-widest">
                Add VITE_GOOGLE_MAPS_API_KEY to .env
              </div>
            )}
            <div className="absolute inset-0 p-6 md:p-8 flex flex-col justify-end bg-gradient-to-t from-background via-background/40 to-transparent pointer-events-none">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl md:text-6xl font-black text-secondary tracking-tight">08.4</span>
                <span className="font-mono text-base md:text-lg text-secondary font-bold tracking-widest">MINS</span>
              </div>
              <p className="font-mono text-[10px] md:text-xs uppercase tracking-widest text-on-surface-variant mt-2">NEXUS Optimized Route (Sigma-4 Applied)</p>
              <div className="mt-4 w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="w-[35%] h-full bg-secondary shadow-[0_0_15px_#4b8eff]"></div>
              </div>
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-primary/20 blur-[100px] pointer-events-none"></div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 flex-1 min-h-0">
        <div className="col-span-12 lg:col-span-8 bg-surface-container rounded-xl border border-white/5 flex flex-col p-4 md:p-6 shadow-inner min-h-[300px] lg:min-h-0">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <h3 className="font-mono text-[9px] md:text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Resource Reallocation Trace (Sankey)</h3>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-primary ring-2 ring-primary/20"></span> <span className="font-mono text-[8px] md:text-[9px] uppercase tracking-wider">Medical</span></div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-tertiary ring-2 ring-tertiary/20"></span> <span className="font-mono text-[8px] md:text-[9px] uppercase tracking-wider">Logistics</span></div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-secondary ring-2 ring-secondary/20"></span> <span className="font-mono text-[8px] md:text-[9px] uppercase tracking-wider">Security</span></div>
            </div>
          </div>
          
          <div className="flex-1 flex flex-col justify-center gap-6 relative min-h-[200px]">
            <div className="grid grid-cols-3 gap-8 h-32 items-center">
              <div className="space-y-4">
                <div className="p-3 bg-white/5 border border-white/5 rounded backdrop-blur-sm">
                  <p className="font-mono text-[9px] mb-1 font-bold">STATION ALPHA</p>
                  <div className="h-1.5 w-full bg-primary-container/20 rounded-full overflow-hidden">
                    <div className="h-full w-full bg-primary shadow-[0_0_8px_rgba(255,180,170,0.5)]"></div>
                  </div>
                </div>
                <div className="p-3 bg-white/5 border border-white/5 rounded backdrop-blur-sm">
                  <p className="font-mono text-[9px] mb-1 font-bold">LOGISTICS HUB B</p>
                  <div className="h-1.5 w-full bg-tertiary/20 rounded-full overflow-hidden">
                    <div className="h-full w-2/3 bg-tertiary shadow-[0_0_8px_rgba(241,193,0,0.5)]"></div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-center items-center gap-4 py-4">
                <div className="w-full h-8 bg-gradient-to-r from-primary/20 via-tertiary/40 to-secondary/20 blur-md rounded-full opacity-60"></div>
                <div className="w-full h-12 bg-gradient-to-r from-primary/30 via-tertiary/50 to-secondary/30 rounded-full shadow-[0_0_20px_rgba(241,193,0,0.2)]"></div>
              </div>

              <div className="space-y-4">
                <div className="p-3 bg-primary/5 border border-primary/30 rounded relative group transition-all hover:bg-primary/10">
                  <p className="font-mono text-[9px] mb-1 text-primary font-black uppercase">Sector 4 (Priority)</p>
                  <p className="font-mono text-[8px] text-on-surface-variant tracking-widest">+42% Capacity</p>
                </div>
                <div className="p-3 bg-white/5 border border-white/5 rounded backdrop-blur-sm">
                  <p className="font-mono text-[9px] mb-1 font-bold">DISTRICT G</p>
                  <p className="font-mono text-[8px] text-error font-bold tracking-widest">-15% DEFERRED</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-4 bg-surface-container rounded-xl border border-white/5 flex flex-col overflow-hidden relative">
          <div className="p-3 bg-surface-container-high border-b border-white/5 flex justify-between items-center">
            <span className="font-mono text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">
              Action Simulator
            </span>
            {result && (
              <button 
                onClick={() => setResult(null)}
                className="text-[8px] font-black text-primary uppercase tracking-widest hover:underline"
              >
                Reset
              </button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <AnimatePresence mode="wait">
              {!activeSimulation || (!isSimulating && !result) ? (
                <motion.div 
                  key="launcher"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  <p className="text-[10px] text-on-surface-variant font-mono uppercase tracking-widest mb-4 opacity-60">Select Tactical Scenario</p>
                  {SCENARIOS.map((scenario) => (
                    <button
                      key={scenario.id}
                      onClick={() => runSimulation(scenario)}
                      disabled={isSimulating}
                      className="w-full text-left p-4 bg-white/5 border border-white/5 rounded-2xl group hover:border-primary/40 transition-all active:scale-[0.98] relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Play className="w-8 h-8 text-primary" />
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={cn(
                          "text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest",
                          scenario.type === "CRITICAL" ? "bg-error/20 text-error" : "bg-tertiary/20 text-tertiary"
                        )}>
                          {scenario.type}
                        </span>
                        <span className="text-[9px] font-mono text-white/30 uppercase">{scenario.actionType}</span>
                      </div>
                      <h4 className="text-sm font-bold text-white group-hover:text-primary transition-colors mb-2">{scenario.title}</h4>
                      <p className="text-[10px] text-on-surface-variant font-mono leading-relaxed line-clamp-2">
                        {scenario.description}
                      </p>
                    </button>
                  ))}
                </motion.div>
              ) : isSimulating ? (
                <motion.div 
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col items-center justify-center py-10"
                >
                  <div className="relative mb-6">
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full"></div>
                  </div>
                  <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-2 animate-pulse">Simulating Scenario</h3>
                  <p className="text-[10px] font-mono text-on-surface-variant uppercase tracking-widest text-center">
                    Agent Core: Processing {activeSimulation?.title}...
                  </p>
                </motion.div>
              ) : (
                <motion.div 
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6 pb-6"
                >
                  <div className="flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-2xl">
                    <CheckCircle2 className="w-6 h-6 text-primary shrink-0" />
                    <div className="min-w-0">
                      <h4 className="text-xs font-black text-white uppercase">Simulation Complete</h4>
                      <p className="text-[9px] font-mono text-primary font-bold uppercase tracking-widest truncate">ARES Outcome Delta v.1.2</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <span className="text-[9px] font-black uppercase text-white/30 tracking-widest">Action Taken</span>
                      <div className="p-3 bg-white/5 border border-white/5 rounded-xl">
                        <p className="text-xs text-on-surface/90 font-medium leading-relaxed italic border-l-2 border-primary pl-3">
                          "{result.actionTaken}"
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-white/5 border border-white/5 rounded-xl">
                        <span className="text-[8px] font-black uppercase text-white/30 block mb-1">ETA Improve</span>
                        <p className="text-sm font-black text-secondary">{result.metrics?.etaImprovement}</p>
                      </div>
                      <div className="p-3 bg-white/5 border border-white/5 rounded-xl">
                        <span className="text-[8px] font-black uppercase text-white/30 block mb-1">Impact</span>
                        <p className="text-sm font-black text-primary">{result.metrics?.congestionImpact}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[9px] font-black uppercase text-white/30 tracking-widest">Future State (T+1h)</span>
                      <p className="text-[11px] text-on-surface-variant font-mono leading-relaxed bg-black/20 p-3 rounded-xl">
                        {result.afterState}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <span className="text-[9px] font-black uppercase text-white/30 tracking-widest">Side Effects</span>
                      <div className="space-y-2">
                        {result.sideEffects?.map((effect: string, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-[10px] text-on-surface-variant font-mono">
                            <div className="w-1 h-1 bg-tertiary rounded-full shadow-[0_0_5px_rgba(241,193,0,0.5)]"></div>
                            {effect}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <footer className="h-10 border-t border-white/10 bg-surface-container-lowest px-4 flex items-center justify-between text-on-surface-variant">
        <div className="flex gap-8">
          <div className="flex gap-3 items-center">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] opacity-50">CPU Load</span>
            <span className="font-mono text-[10px] text-secondary font-bold">42.8%</span>
          </div>
          <div className="flex gap-3 items-center">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] opacity-50">Bandwidth</span>
            <span className="font-mono text-[10px] text-secondary font-bold">1.2 GB/s</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }} className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px_#4b8eff]"></motion.div>
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] opacity-70">Encrypted Telemetry Stream Active</span>
        </div>
      </footer>
    </div>
  );
}
