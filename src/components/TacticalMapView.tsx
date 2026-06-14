import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import {
  History,
  Play,
  Pause,
  RotateCcw,
  Wifi,
  Bell,
  Settings,
  Target,
  Send,
  Mic,
  Video,
  Locate,
  Navigation,
  Thermometer,
  Activity,
  Heart,
  ChevronDown,
  ArrowUpDown,
  Droplet,
  Zap,
  Box,
  Truck,
  Plus,
  Minus,
  Map as MapIcon,
  Rss,
  Cloud,
  Car,
  Bot,
  AlertCircle,
  X,
  Filter,
  Check,
  Download,
  Search,
  Shapes,
  Maximize2,
  Pencil,
  Trash2,
  Circle as CircleIcon,
  Layers,
  Hospital,
  Droplets,
  Route,
  ShieldAlert,
  Globe,
  KeyRound
} from "lucide-react";
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { APIProvider, Map, AdvancedMarker, Pin, Circle, Polyline } from "@vis.gl/react-google-maps";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const signalTypes = [
  { id: "social", icon: Rss, label: "SIEM" },
  { id: "weather", icon: Cloud, label: "Monitoring" },
  { id: "traffic", icon: Car, label: "Ticketing" },
  { id: "ai", icon: Bot, label: "AI Assistant" },
];

const crisisTags = [
  { id: "flood_en", label: "Security", icon: "🌊" },
  { id: "flood_ur", label: "Outage", icon: "🌊" },
  { id: "heatwave", label: "Heatwave", icon: "🔥" },
  { id: "accident", label: "Accident", icon: "💥" },
  { id: "infra_fail", label: "Infra Fail", icon: "🏗️" },
  { id: "road_block", label: "Road Block", icon: "🚧" },
];

interface Asset {
  id: string;
  name: string;
  status: "critical" | "high" | "medium" | "low";
  type: "unit" | "drone" | "medical" | "fire";
  location: { x: number; y: number };
  tags: string[];
  history: { 
    x: number; 
    y: number; 
    timestamp: number; 
    status: "critical" | "high" | "medium" | "low";
    telemetry?: {
      battery: number;
      signal: number;
      load: number;
      temp: number;
    }
  }[];
  telemetry: {
    battery: number;
    signal: number;
    load: number;
    temp: number;
  };
}

interface Zone {
  id: string;
  name: string;
  points: { x: number; y: number }[];
  type: "critical" | "alert" | "deployment";
  color: string;
}

const GMAPS_KEY: string | undefined = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY;

// ── Karachi coordinate projection ─────────────────────────────────────────────
const LAT_MIN = 24.75, LAT_MAX = 25.10;
const LNG_MIN = 66.85, LNG_MAX = 67.30;
const lngToX = (lng: number) => ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * 90 + 5;
const latToY = (lat: number) => ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * 90 + 5;

interface InfrastructureMarker {
  id: string;
  type: 'hospital' | 'water_facility' | 'evacuation' | 'route';
  name: string;
  x: number;
  y: number;
  detail: string;
  extra?: Record<string, any>;
}

interface AlternativeRoute {
  id: string;
  name: string;
  status: 'clear' | 'congested' | 'closed';
  points: { x: number; y: number }[];
}

interface ConfidenceBreakdown {
  socialMedia:   { score: number; weight: number; factors: string[]; verdict: string };
  weather:       { score: number; weight: number; factors: string[]; verdict: string };
  mapsTraffic:   { score: number; weight: number; factors: string[]; verdict: string };
  weightedScore: number;
  displayLevel:  'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

const TelemetrySparkline = ({ data, dataKey, color, label, unit }: { data: any[], dataKey: string, color: string, label: string, unit: string }) => {
  const values = data.map(d => d[dataKey]);
  const min = values.length ? Math.min(...values).toFixed(1) : "0.0";
  const max = values.length ? Math.max(...values).toFixed(1) : "0.0";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center text-[9px] font-bold uppercase text-white/60">
        <span>{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-white/40 text-[7px] font-black">MIN {min}{unit} / MAX {max}{unit}</span>
          <span className="text-white">{data[data.length - 1]?.[dataKey]?.toFixed(0) ?? 0}{unit}</span>
        </div>
      </div>
      <div className="h-6 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const val = payload[0].value as number;
                  const isMin = val.toFixed(1) === min;
                  const isMax = val.toFixed(1) === max;
                  return (
                    <div className="bg-[#14181f] border border-white/10 p-1.5 rounded shadow-xl shrink-0 min-w-[80px]">
                      <p className="text-[7px] font-black text-white/40 uppercase mb-1">{payload[0].payload.time}</p>
                      <div className="flex flex-col gap-1">
                        <p className="text-[10px] font-extrabold text-white flex items-center justify-between gap-2">
                          <span>{val.toFixed(1)}{unit}</span>
                          <span className="flex gap-1">
                            {isMax && <span className="text-[6px] px-1 py-0.5 bg-[#00e5ff]/20 text-[#00e5ff] rounded font-black">MAX</span>}
                            {isMin && <span className="text-[6px] px-1 py-0.5 bg-[#ff4d4d]/20 text-[#ff4d4d] rounded font-black">MIN</span>}
                          </span>
                        </p>
                        <div className="border-t border-white/5 pt-1 mt-1 flex flex-col gap-0.5">
                           <p className="text-[6px] text-white/30 uppercase flex justify-between font-black tracking-widest">
                             <span>RNG MIN</span> <span className="text-white/60">{min}{unit}</span>
                           </p>
                           <p className="text-[6px] text-white/30 uppercase flex justify-between font-black tracking-widest">
                             <span>RNG MAX</span> <span className="text-white/60">{max}{unit}</span>
                           </p>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line 
              type="monotone" 
              dataKey={dataKey} 
              stroke={color} 
              strokeWidth={1.5} 
              dot={false} 
              isAnimationActive={false} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

interface TacticalMapViewProps {
  incidents?: any[];
}

export default function TacticalMapView({ incidents: liveIncidents = [] }: TacticalMapViewProps) {
  const [activeSignalTab, setActiveSignalTab] = useState("social");
  const [signalText,   setSignalText]   = useState("");
  const [tabLoading,   setTabLoading]   = useState(false);
  const [tabError,     setTabError]     = useState<string | null>(null);

  // ── AI Chatbot state ──────────────────────────────────────────────────────
  type ChatMsg = { role: "user" | "model"; content: string };
  const [chatMessages,   setChatMessages]   = useState<ChatMsg[]>([]);
  const [chatInput,      setChatInput]      = useState("");
  const [chatLoading,    setChatLoading]    = useState(false);
  const [chatSignal,     setChatSignal]     = useState<any>(null);
  const [chatSubmitting, setChatSubmitting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeSignalTab === "ai" && chatMessages.length === 0) {
      setChatMessages([{
        role: "model",
        content: "Hello, I'm Maestro AI. I'll help you report an incident. What's happening right now?",
      }]);
    }
  }, [activeSignalTab]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Auto-fetch live context when switching to weather / traffic / social tabs
  useEffect(() => {
    if (activeSignalTab === "ai") return;
    setSignalText("");
    setTabError(null);
    const ctxType = activeSignalTab === "weather" ? "weather"
                  : activeSignalTab === "traffic" ? "traffic"
                  : "social";
    setTabLoading(true);
    fetch(`/api/data/live-context?type=${ctxType}`)
      .then(r => r.json())
      .then(d => { if (d.summary) setSignalText(d.summary); })
      .catch(() => setTabError("Live feed unavailable — type your signal manually."))
      .finally(() => setTabLoading(false));
  }, [activeSignalTab]);

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMsg = { role: "user", content: chatInput.trim() };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/chat/incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: "model", content: data.reply }]);
      if (data.readyToSubmit && data.signal) {
        setChatSignal(data.signal);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: "model", content: "Connection error — please try again." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChatSubmit = async () => {
    if (!chatSignal || chatSubmitting) return;
    setChatSubmitting(true);
    try {
      const description = chatSignal.description ?? chatMessages.filter(m => m.role === "user").map(m => m.content).join(" ");
      const res = await fetch("/api/ingest-signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source:  "call",
          type:    chatSignal.type ?? "manual_report",
          urgency: chatSignal.urgency ?? 7,
          data: {
            text:          description,
            locationLabel: chatSignal.locationLabel,
            severity:      chatSignal.severity,
            submittedVia:  "TacticalMapView-AI",
          },
        }),
      });
      const result = await res.json();
      const inc = result.incident;
      setChatMessages(prev => [...prev, {
        role: "model",
        content: inc
          ? `✅ Report submitted! Incident ID: ${inc.incidentId?.slice(0, 8)}… — marked on map as UNVERIFIED while agents verify.`
          : `✅ Report received. ${result.message ?? "Processing..."}`,
      }]);
      setChatSignal(null);
      if (inc) {
        setDetectedLanguage(inc.detectedLanguage ?? null);
        setActiveSignals(prev => [{
          id: `sig-${Date.now()}`,
          type: "ai",
          source: "AI Intake",
          text: description.slice(0, 80),
          time: "just now",
          priority: chatSignal.severity === "critical" || chatSignal.severity === "high" ? "high" : "medium",
        }, ...prev].slice(0, 10));
      }
    } catch {
      setChatMessages(prev => [...prev, { role: "model", content: "Submission failed — please try again." }]);
    } finally {
      setChatSubmitting(false);
    }
  };
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<{ id: string; assetName: string; event: string; time: string; type: 'status' | 'movement' | 'alert' }[]>([]);
  const [activeSignals, setActiveSignals] = useState<any[]>([
    { id: 'sig-1', type: 'social', source: '@CrisisWatch', text: 'Bridge collapse reported near Sector 7. Emergency services needed.', time: '2m ago', priority: 'high' },
    { id: 'sig-2', type: 'weather', source: 'MET-OS', text: 'Peak temperatures reaching 50°C. Power grid under heavy load.', time: '5m ago', priority: 'medium' },
    { id: 'sig-3', type: 'traffic', source: 'City-Live', text: 'Major route blockages on M-9 due to spontaneous protests.', time: '12m ago', priority: 'low' },
  ]);
  const [historyTimeRange, setHistoryTimeRange] = useState(15); // in minutes
  const [historyPlaybackPercent, setHistoryPlaybackPercent] = useState(100); // 100 is current time
  const [isPlaybackRunning, setIsPlaybackRunning] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [zoom, setZoom] = useState(1);
  const CLUSTER_DISTANCE = 8; // distance in map units

  const [assets, setAssets] = useState<Asset[]>([
    { id: "ast-01", name: "Alpha Unit", status: "critical", type: "unit", location: { x: 45, y: 55 }, tags: ["Heatwave", "Infra Fail"], history: [{ x: 45, y: 55, timestamp: Date.now(), status: "critical", telemetry: { battery: 42, signal: 88, load: 92, temp: 48 } }], telemetry: { battery: 42, signal: 88, load: 92, temp: 48 } },
    { id: "ast-02", name: "Drone-7", status: "high", type: "drone", location: { x: 60, y: 40 }, tags: ["Flood", "Accident"], history: [{ x: 60, y: 40, timestamp: Date.now(), status: "high", telemetry: { battery: 18, signal: 45, load: 60, temp: 52 } }], telemetry: { battery: 18, signal: 45, load: 60, temp: 52 } },
    { id: "ast-03", name: "Med-Evac", status: "medium", type: "medical", location: { x: 30, y: 35 }, tags: ["Accident"], history: [{ x: 30, y: 35, timestamp: Date.now(), status: "medium", telemetry: { battery: 75, signal: 92, load: 30, temp: 38 } }], telemetry: { battery: 75, signal: 92, load: 30, temp: 38 } },
    { id: "ast-04", name: "Fire Ops", status: "low", type: "fire", location: { x: 75, y: 65 }, tags: ["Heatwave", "Road Block"], history: [{ x: 75, y: 65, timestamp: Date.now(), status: "low", telemetry: { battery: 90, signal: 95, load: 15, temp: 41 } }], telemetry: { battery: 90, signal: 95, load: 15, temp: 41 } },
  ]);

  // ── Language + Confidence + Infrastructure state ───────────────────────────
  const [detectedLanguage, setDetectedLanguage]         = useState<string | null>(null);
  const [isRomanUrdu, setIsRomanUrdu]                   = useState(false);
  const [confidenceBreakdown, setConfidenceBreakdown]   = useState<ConfidenceBreakdown | null>(null);
  const [infrastructureMarkers, setInfrastructureMarkers] = useState<InfrastructureMarker[]>([]);
  const [alternativeRoutes, setAlternativeRoutes]       = useState<AlternativeRoute[]>([]);
  const [isAnalyzing, setIsAnalyzing]                   = useState(false);
  const [lastAnalysisResult, setLastAnalysisResult]     = useState<any>(null);

  // Sync infrastructure markers from liveIncidents prop (auto-updates via WebSocket)
  React.useEffect(() => {
    if (!liveIncidents.length) return;
    const markers: InfrastructureMarker[] = [];
    const routes:  AlternativeRoute[]      = [];
    for (const inc of liveIncidents) {
      const infra = inc.infrastructureRecommendations;
      if (!infra) continue;
      for (const h of infra.nearbyHospitals ?? []) {
        markers.push({ id: h.id, type: 'hospital', name: h.name,
          x: lngToX(h.lng), y: latToY(h.lat),
          detail: `${h.distanceKm}km · ${h.bedsAvailable} beds${h.hasTraumaUnit ? ' · Trauma' : ''}`,
          extra: h });
      }
      for (const w of infra.waterFacilities ?? []) {
        markers.push({ id: w.id, type: 'water_facility', name: w.name,
          x: lngToX(w.lng), y: latToY(w.lat),
          detail: `${w.type} · ${w.status}`, extra: w });
      }
      for (const e of infra.evacuationPoints ?? []) {
        markers.push({ id: e.id, type: 'evacuation', name: e.name,
          x: lngToX(e.lng), y: latToY(e.lat),
          detail: `Capacity: ${e.capacity}`, extra: e });
      }
      for (const r of infra.alternativeRoutes ?? []) {
        if (r.waypoints?.length >= 2) {
          routes.push({ id: r.id, name: r.name,
            status: r.status as AlternativeRoute['status'],
            points: r.waypoints.map((w: any) => ({ x: lngToX(w.lng), y: latToY(w.lat) })) });
        }
      }
    }
    if (markers.length) setInfrastructureMarkers(markers);
    if (routes.length)  setAlternativeRoutes(routes);
    const first = liveIncidents.find(i => i.confidenceBreakdown);
    if (first?.confidenceBreakdown) setConfidenceBreakdown(first.confidenceBreakdown);
  }, [liveIncidents]);

  const handleAnalyzeSignal = async () => {
    if (!signalText.trim() || isAnalyzing) return;
    setIsAnalyzing(true);
    setDetectedLanguage(null);
    setConfidenceBreakdown(null);
    try {
      const res = await fetch('/api/ingest-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: activeSignalTab === 'ai' ? 'social' : activeSignalTab,
          type:   'manual_report',
          data:   { text: signalText, submittedVia: 'TacticalMapView' },
          urgency: 7,
        }),
      });
      const result = await res.json();
      setLastAnalysisResult(result);
      const inc = result.incident;
      if (inc) {
        if (inc.detectedLanguage)   setDetectedLanguage(inc.detectedLanguage);
        if (inc.isRomanUrdu)        setIsRomanUrdu(inc.isRomanUrdu);
        if (inc.confidenceBreakdown) setConfidenceBreakdown(inc.confidenceBreakdown);
        // Inject infrastructure markers from this new incident
        const infra = inc.infrastructureRecommendations;
        if (infra) {
          const newMarkers: InfrastructureMarker[] = [];
          const newRoutes:  AlternativeRoute[]      = [];
          for (const h of infra.nearbyHospitals ?? []) {
            newMarkers.push({ id: h.id, type: 'hospital', name: h.name,
              x: lngToX(h.lng), y: latToY(h.lat),
              detail: `${h.distanceKm}km · ${h.bedsAvailable} beds`, extra: h });
          }
          for (const w of infra.waterFacilities ?? []) {
            newMarkers.push({ id: w.id, type: 'water_facility', name: w.name,
              x: lngToX(w.lng), y: latToY(w.lat),
              detail: `${w.type}`, extra: w });
          }
          for (const e of infra.evacuationPoints ?? []) {
            newMarkers.push({ id: e.id, type: 'evacuation', name: e.name,
              x: lngToX(e.lng), y: latToY(e.lat),
              detail: `Cap: ${e.capacity}`, extra: e });
          }
          for (const r of infra.alternativeRoutes ?? []) {
            if (r.waypoints?.length >= 2) {
              newRoutes.push({ id: r.id, name: r.name, status: r.status,
                points: r.waypoints.map((w: any) => ({ x: lngToX(w.lng), y: latToY(w.lat) })) });
            }
          }
          setInfrastructureMarkers(prev => [...prev, ...newMarkers]);
          setAlternativeRoutes(prev => [...prev, ...newRoutes]);
        }
        // Inject new signal into live feed
        setActiveSignals(prev => [{
          id: `sig-${Date.now()}`,
          type: activeSignalTab,
          source: inc.detectedLanguage ? `[${inc.detectedLanguage}]` : 'Manual',
          text: signalText,
          time: 'just now',
          priority: inc.severity === 'critical' || inc.severity === 'high' ? 'high' : 'medium',
        }, ...prev].slice(0, 10));
      }
    } catch (e) {
      console.error('Signal analysis failed:', e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const [historyRangeType, setHistoryRangeType] = useState<"minutes" | "custom">("minutes");
  const [historyCustomStart, setHistoryCustomStart] = useState<string>(
    new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 16)
  );
  const [historyCustomEnd, setHistoryCustomEnd] = useState<string>(
    new Date().toISOString().slice(0, 16)
  );

  const selectedAsset = useMemo(() => 
    assets.find(a => a.id === selectedAssetId), 
  [assets, selectedAssetId]);

  const scrubbedPosition = useMemo(() => {
    if (!selectedAsset || selectedAsset.history.length === 0) return null;
    
    // Filter history based on current time range
    const relevantHistory = selectedAsset.history.filter(h => {
      if (historyRangeType === "minutes") {
        return Date.now() - h.timestamp < historyTimeRange * 60 * 1000;
      } else {
        const start = historyCustomStart ? new Date(historyCustomStart).getTime() : 0;
        const end = historyCustomEnd ? new Date(historyCustomEnd).getTime() : Date.now();
        return h.timestamp >= start && h.timestamp <= end;
      }
    });

    if (relevantHistory.length === 0) return selectedAsset.location;
    
    // If playback is at 100%, return current location
    if (historyPlaybackPercent >= 100) return selectedAsset.location;
    
    // Interpolate position based on percentage through relevant history
    const totalPoints = relevantHistory.length;
    const exactIndex = (historyPlaybackPercent / 100) * (totalPoints - 1);
    const index = Math.floor(exactIndex);
    const nextIndex = Math.min(index + 1, totalPoints - 1);
    const fraction = exactIndex - index;
    
    const p1 = relevantHistory[index];
    const p2 = relevantHistory[nextIndex];
    
    return {
      x: p1.x + (p2.x - p1.x) * fraction,
      y: p1.y + (p2.y - p1.y) * fraction,
      timestamp: p1.timestamp + (p2.timestamp - p1.timestamp) * fraction
    };
  }, [selectedAsset, historyPlaybackPercent, historyTimeRange, historyRangeType, historyCustomStart, historyCustomEnd]);

  const [proximityRadius, setProximityRadius] = useState(25);
  const [alertCenter, setAlertCenter] = useState({ x: 50, y: 50 });
  const [isSettingEpicenter, setIsSettingEpicenter] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [proximityMode, setProximityMode] = useState<"radius" | "polygon">("radius");
  const [polygonPoints, setPolygonPoints] = useState<{ x: number, y: number }[]>([]);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [zones, setZones] = useState<Zone[]>([
    { id: "z-1", name: "Alpha Sector", type: "critical", color: "#ff4d4d", points: [{x: 20, y: 20}, {x: 40, y: 20}, {x: 35, y: 45}, {x: 15, y: 40}] }
  ]);

  const isPointInPolygon = (point: { x: number; y: number }, polygon: { x: number; y: number }[]) => {
    if (polygon.length < 3) return true;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      const intersect = ((yi > point.y) !== (yj > point.y))
          && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (isSettingEpicenter) {
      setAlertCenter({ x, y });
      setIsSettingEpicenter(false);
      return;
    }

    if (isDrawingPolygon) {
      // Check if clicking near first point to close
      if (polygonPoints.length >= 3) {
        const first = polygonPoints[0];
        const dist = Math.sqrt(Math.pow(x - first.x, 2) + Math.pow(y - first.y, 2));
        if (dist < 2) {
          // Close and save
          const newZone: Zone = {
            id: `zone-${Date.now()}`,
            name: `New Zone ${zones.length + 1}`,
            points: [...polygonPoints],
            type: "alert",
            color: "#00e5ff"
          };
          setZones(prev => [...prev, newZone]);
          setPolygonPoints([]);
          setIsDrawingPolygon(false);
          return;
        }
      }
      setPolygonPoints(prev => [...prev, { x, y }]);
      return;
    }
  };
  const [visibleLayers, setVisibleLayers] = useState({
    incidents:    true,
    responders:   false,
    clusters:     false,
    heatmap:      false,
    disasterZones: false,
    blockedRoads:  false,
    routeLines:    false,
    // internal aliases used by existing SVG overlays
    assets:         true,
    zones:          true,
    traffic:        false,
    weather:        false,
    infrastructure: true,
  });
  const toggleLayer = (key: keyof typeof visibleLayers) =>
    setVisibleLayers(prev => ({ ...prev, [key]: !prev[key] }));
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);

  const [filterStatuses, setFilterStatuses] = useState<Asset["status"][]>(["critical", "high", "medium", "low"]);
  const [filterTypes, setFilterTypes] = useState<Asset["type"][]>(["unit", "drone", "medical", "fire"]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showProximityOnly, setShowProximityOnly] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  const assetTypes: Asset["type"][] = ["unit", "drone", "medical", "fire"];
  const assetStatuses: Asset["status"][] = ["critical", "high", "medium", "low"];

  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      const statusMatch = filterStatuses.includes(asset.status);
      const typeMatch = filterTypes.includes(asset.type);
      
      const tagMatch = selectedTags.length === 0 || selectedTags.some(tag => asset.tags.includes(tag));
      
      const searchLower = searchQuery.toLowerCase();
      const queryMatch = !searchQuery || 
        asset.name.toLowerCase().includes(searchLower) || 
        asset.type.toLowerCase().includes(searchLower);

      let proximityMatch = true;
      if (showProximityOnly) {
        if (proximityMode === "radius") {
          const dist = Math.sqrt(
            Math.pow(asset.location.x - alertCenter.x, 2) + 
            Math.pow(asset.location.y - alertCenter.y, 2)
          );
          proximityMatch = dist < proximityRadius;
        } else if (proximityMode === "polygon") {
          proximityMatch = isPointInPolygon(asset.location, polygonPoints);
        }
      }

      return statusMatch && typeMatch && proximityMatch && queryMatch && tagMatch;
    });
  }, [assets, filterStatuses, filterTypes, showProximityOnly, proximityRadius, searchQuery, alertCenter, proximityMode, polygonPoints, selectedTags]);

  const clusteredAssets = useMemo(() => {
    // When clusters layer is OFF or zoomed in, show all individual assets
    if (!visibleLayers.clusters || zoom >= 3) {
      return filteredAssets.map(asset => ({
        type: 'asset' as const,
        id: asset.id,
        x: asset.location.x,
        y: asset.location.y,
        assets: [asset],
        count: 1
      }));
    }

    const clusters: { id: string; x: number; y: number; assets: Asset[]; type: 'cluster' | 'asset'; count: number }[] = [];
    const processed = new Set<string>();
    
    // Dynamic cluster distance based on zoom
    const effectiveDistance = CLUSTER_DISTANCE / zoom;

    filteredAssets.forEach(asset => {
      if (processed.has(asset.id)) return;

      const nearbyAssets = filteredAssets.filter(other => {
        if (processed.has(other.id)) return false;
        const dist = Math.sqrt(Math.pow(asset.location.x - other.location.x, 2) + Math.pow(asset.location.y - other.location.y, 2));
        return dist < effectiveDistance;
      });

      if (nearbyAssets.length > 1) {
        const avgX = nearbyAssets.reduce((sum, a) => sum + a.location.x, 0) / nearbyAssets.length;
        const avgY = nearbyAssets.reduce((sum, a) => sum + a.location.y, 0) / nearbyAssets.length;
        clusters.push({
          id: `cluster-${asset.id}`,
          type: 'cluster',
          x: avgX,
          y: avgY,
          assets: nearbyAssets,
          count: nearbyAssets.length
        });
        nearbyAssets.forEach(a => processed.add(a.id));
      } else {
        clusters.push({
          id: asset.id,
          type: 'asset',
          x: asset.location.x,
          y: asset.location.y,
          assets: [asset],
          count: 1
        });
        processed.add(asset.id);
      }
    });

    return clusters;
  }, [filteredAssets, zoom, CLUSTER_DISTANCE, visibleLayers.clusters]);

  const stats = useMemo(() => {
    const active = liveIncidents.filter(i => i.status !== "retracted");
    return {
      critical:     active.filter(i => i.severity === "critical").length,
      emergency:    active.filter(i => i.severity === "high").length,
      nonEmergency: active.filter(i => i.severity === "medium" || i.severity === "low").length,
      unknown:      active.filter(i => i.status === "unverified").length,
    };
  }, [liveIncidents]);

  useEffect(() => {
    const interval = setInterval(() => {
      setAssets(current => current.map(asset => {
        const shouldChangeStatus = Math.random() > 0.85;
        const newStatus = shouldChangeStatus 
          ? (["critical", "high", "medium", "low"] as const)[Math.floor(Math.random() * 4)]
          : asset.status;

        const newLocation = {
          x: Math.min(90, Math.max(10, asset.location.x + (Math.random() - 0.5) * 1.5)),
          y: Math.min(90, Math.max(10, asset.location.y + (Math.random() - 0.5) * 1.5))
        };

        const newTelemetry = {
          battery: Math.max(0, Math.min(100, asset.telemetry.battery + (Math.random() - 0.6) * 2)),
          signal: Math.max(10, Math.min(100, asset.telemetry.signal + (Math.random() - 0.5) * 5)),
          load: Math.max(5, Math.min(100, asset.telemetry.load + (Math.random() - 0.45) * 4)),
          temp: Math.max(30, Math.min(60, asset.telemetry.temp + (Math.random() - 0.5) * 1.5))
        };

        const newHistory = [...asset.history, { ...asset.location, timestamp: Date.now(), status: newStatus, telemetry: newTelemetry }].slice(-300);

        if (shouldChangeStatus) {
          setTelemetry(prev => [{
            id: `tel-${Math.random()}`,
            assetName: asset.name,
            event: `Status changed to ${newStatus.toUpperCase()}`,
            time: new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
            type: 'status' as const,
          }, ...prev].slice(0, 50));
        }

        return {
          ...asset,
          status: newStatus,
          location: newLocation,
          history: newHistory,
          telemetry: newTelemetry
        };
      }));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let intervalId: any;
    if (isPlaybackRunning) {
      intervalId = setInterval(() => {
        setHistoryPlaybackPercent(prev => {
          if (prev >= 100) {
            setIsPlaybackRunning(false);
            return 100;
          }
          return Math.min(100, prev + (0.5 * playbackSpeed));
        });
      }, 100);
    }
    return () => clearInterval(intervalId);
  }, [isPlaybackRunning]);

   const getStatusLevel = (status: Asset["status"]) => {
    switch (status) {
      case "critical": return 4;
      case "high": return 3;
      case "medium": return 2;
      case "low": return 1;
      default: return 0;
    }
  };

  const statusHistoryData = useMemo(() => {
    if (!selectedAsset) return [];
    
    // Calculate displacement from first point in range
    const historyInRange = selectedAsset.history.filter(h => {
      if (historyRangeType === "minutes") {
        return Date.now() - h.timestamp < historyTimeRange * 60 * 1000;
      } else {
        const start = historyCustomStart ? new Date(historyCustomStart).getTime() : 0;
        const end = historyCustomEnd ? new Date(historyCustomEnd).getTime() : Date.now();
        return h.timestamp >= start && h.timestamp <= end;
      }
    });

    if (historyInRange.length === 0) return [];

    const startPoint = historyInRange[0];

    return historyInRange.map((h, idx) => {
      const dx = h.x - startPoint.x;
      const dy = h.y - startPoint.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Calculate velocity if possible
      let velocity = 0;
      if (idx > 0) {
        const prev = historyInRange[idx - 1];
        const dt = (h.timestamp - prev.timestamp) / 1000; // seconds
        if (dt > 0) {
          const displacementX = h.x - prev.x;
          const displacementY = h.y - prev.y;
          const stepDist = Math.sqrt(displacementX * displacementX + displacementY * displacementY);
          velocity = (stepDist / dt) * 10; // Scaled for visualization
        }
      }

      return {
        time: new Date(h.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
        level: getStatusLevel(h.status),
        status: h.status,
        displacement: parseFloat(dist.toFixed(2)),
        velocity: parseFloat(velocity.toFixed(2)),
        x: parseFloat(h.x.toFixed(1)),
        y: parseFloat(h.y.toFixed(1)),
        battery: h.telemetry?.battery ?? 0,
        signal: h.telemetry?.signal ?? 0,
        load: h.telemetry?.load ?? 0,
        temp: h.telemetry?.temp ?? 0,
      };
    });
  }, [selectedAsset, historyTimeRange, historyRangeType, historyCustomStart, historyCustomEnd]);

  const getStatusColor = (status: Asset["status"]) => {
    switch (status) {
      case "critical": return "#ff4d4d";
      case "high": return "#ff6b00";
      case "medium": return "#ffd600";
      case "low": return "#00e676";
      default: return "#e0e0e0";
    }
  };

  const getAssetIcon = (type: Asset["type"]) => {
    switch (type) {
      case "drone": return Bot;
      case "medical": return Heart;
      case "fire": return Zap;
      case "unit": return Navigation;
      default: return Box;
    }
  };

  const handleExportCSV = () => {
    const headers = ["ID", "Name", "Status", "Type", "Location X", "Location Y", "Battery", "Signal", "Load", "Temp", "Last Updated"];
    const records = assets.map(asset => [
      asset.id,
      asset.name,
      asset.status,
      asset.type,
      asset.location.x.toFixed(2),
      asset.location.y.toFixed(2),
      asset.telemetry.battery.toFixed(0),
      asset.telemetry.signal.toFixed(0),
      asset.telemetry.load.toFixed(0),
      asset.telemetry.temp.toFixed(1),
      asset.history.length > 0 ? new Date(asset.history[asset.history.length - 1].timestamp).toISOString() : "N/A"
    ]);

    const csvContent = [headers, ...records].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `ciro_tactical_data_${new Date().toISOString()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [activeNav, setActiveNav] = useState<"monitor" | "response" | "command">("monitor");

  return (
    <div className="flex flex-col h-full bg-[#0a0c10] text-[#e0e0e0] font-sans animate-in fade-in duration-500 overflow-hidden">
      {/* Header */}
      <header className="flex flex-col md:flex-row items-center justify-between px-4 md:px-8 py-4 bg-[#0a0c10] border-b border-white/5 gap-4 shrink-0">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-[#00e5ff]/20 rounded-full flex items-center justify-center border border-[#00e5ff]/30 shrink-0">
            <div className="w-6 h-6 md:w-8 md:h-8 rounded-full border-2 border-[#00e5ff] flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[#00e5ff]/10 animate-pulse"></div>
              <Activity className="w-4 h-4 text-[#00e5ff]" />
            </div>
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-[#00e5ff] leading-none truncate">Maestro</h1>
            <p className="text-[8px] md:text-[10px] uppercase tracking-[0.2em] font-bold opacity-50 mt-1 truncate">Enterprise Incident Response Network</p>
          </div>
        </div>

        <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10 overflow-x-auto no-scrollbar max-w-full">
          {([
            { id: "monitor" as const,  label: "Monitor",  icon: "●",  emoji: null },
            { id: "response" as const, label: "Response", icon: null, emoji: "🚨" },
            { id: "command" as const,  label: "Command",  icon: null, emoji: "🎖️" },
          ]).map(nav => (
            <button
              key={nav.id}
              onClick={() => setActiveNav(nav.id)}
              className={cn(
                "flex items-center gap-2 px-4 md:px-6 py-2 md:py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                activeNav === nav.id
                  ? "bg-gradient-to-r from-[#00d2ff] to-[#3a7bd5] text-white shadow-[0_0_20px_rgba(0,210,255,0.4)]"
                  : "text-white/40 hover:text-white/70"
              )}
            >
              {nav.icon && <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-white animate-pulse" />}
              {nav.emoji && <span className="text-base md:text-lg">{nav.emoji}</span>}
              {nav.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Global Status Bar */}
      <div className="flex items-center gap-6 md:gap-12 px-4 md:px-12 py-3 bg-[#0a0c10] border-b border-white/5 overflow-x-auto no-scrollbar shrink-0">
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-[#ff4d4d] shadow-[0_0_8px_#ff4d4d]"></div>
          <span className="text-[10px] md:text-xs font-bold text-white/60">Critical</span>
          <span className="text-base md:text-lg font-black text-[#ff4d4d]">{stats.critical}</span>
        </div>
        <div className="h-4 w-px bg-white/10 shrink-0"></div>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-[#ff6b00] shadow-[0_0_8px_#ff6b00]"></div>
          <span className="text-[10px] md:text-xs font-bold text-white/60">Emergency</span>
          <span className="text-base md:text-lg font-black text-[#ff6b00]">{stats.emergency}</span>
        </div>
        <div className="h-4 w-px bg-white/10 shrink-0"></div>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <div className="w-2 h-2 md:w-3 md:h-3 rounded-full bg-[#ffd600] shadow-[0_0_8px_#ffd600]"></div>
          <span className="text-[10px] md:text-xs font-bold text-white/60">Non-Emergency</span>
          <span className="text-base md:text-lg font-black text-[#ffd600]">{stats.nonEmergency}</span>
        </div>
        <div className="h-4 w-px bg-white/10 shrink-0"></div>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <div className="w-8 h-8 md:w-10 md:h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10">
            <Activity className="w-4 h-4 md:w-5 md:h-5 text-[#3a7bd5]" />
          </div>
          <span className="text-[9px] md:text-xs font-bold text-white/60 uppercase tracking-widest leading-none">Total<br />Incidents</span>
          <span className="text-xl md:text-2xl font-black text-[#00e5ff]">{liveIncidents.filter(i => i.status !== "retracted").length}</span>
        </div>
      </div>

      {/* ── RESPONSE VIEW ──────────────────────────────────────────────────── */}
      {activeNav === "response" && (
        <div className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">🚨</span>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Response Operations</h2>
            <div className="ml-auto flex items-center gap-2 bg-red-500/15 border border-red-500/30 rounded-full px-3 py-1">
              <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-red-400">ACTIVE</span>
            </div>
          </div>

          {/* Emergency Route Map */}
          {GMAPS_KEY ? (
            <div className="rounded-2xl overflow-hidden border border-[#00e5ff]/20 shadow-xl" style={{ height: 380 }}>
              <APIProvider apiKey={GMAPS_KEY}>
                <Map
                  mapId="maestro-response"
                  defaultCenter={{ lat: 25, lng: 10 }}
                  defaultZoom={2}
                  disableDefaultUI
                  colorScheme="DARK"
                  style={{ width: "100%", height: "100%" }}
                >
                  {/* Incident markers + affected-area radius circles */}
                  {liveIncidents.filter(i => i.location?.lat && i.location?.lng && i.status !== "retracted").map(inc => {
                    const unverified = inc.status === "unverified";
                    const color = unverified ? "#f59e0b"
                      : inc.severity === "critical" ? "#ef4444"
                      : inc.severity === "high"     ? "#f97316"
                      : inc.severity === "medium"   ? "#3b82f6"
                      : "#22c55e";
                    return (
                      <React.Fragment key={inc.incidentId}>
                        {/* Affected-area radius circle */}
                        <Circle
                          center={{ lat: inc.location.lat, lng: inc.location.lng }}
                          radius={inc.radius ?? 1000}
                          strokeColor={color}
                          strokeOpacity={0.7}
                          strokeWeight={2}
                          fillColor={color}
                          fillOpacity={0.08}
                        />
                        {/* Pin marker */}
                        <AdvancedMarker position={{ lat: inc.location.lat, lng: inc.location.lng }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: "50%",
                            background: `${color}22`,
                            border: `3px solid ${color}`,
                            boxShadow: `0 0 16px ${color}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11,
                          }}>
                            {unverified ? "❓" : inc.severity === "critical" ? "🔴" : inc.severity === "high" ? "🟠" : "🔵"}
                          </div>
                        </AdvancedMarker>
                      </React.Fragment>
                    );
                  })}
                  {/* Alternative routes as polylines */}
                  {liveIncidents.flatMap(inc =>
                    (inc.infrastructureRecommendations?.alternativeRoutes ?? [])
                      .filter((r: any) => r.waypoints?.length >= 2)
                      .map((r: any) => (
                        <Polyline
                          key={`route-${inc.incidentId}-${r.id}`}
                          path={r.waypoints.map((w: any) => ({ lat: w.lat, lng: w.lng }))}
                          strokeColor={r.status === "clear" ? "#22c55e" : r.status === "congested" ? "#f97316" : "#ef4444"}
                          strokeOpacity={0.85}
                          strokeWeight={3}
                        />
                      ))
                  )}
                </Map>
              </APIProvider>
            </div>
          ) : (
            <div className="rounded-2xl bg-[#14181f] border border-[#00e5ff]/20 flex items-center justify-center" style={{ height: 280 }}>
              <div className="text-center">
                <MapIcon className="w-10 h-10 text-[#00e5ff]/30 mx-auto mb-3" />
                <p className="text-[11px] font-bold text-white/30 uppercase tracking-widest">ADD VITE_GOOGLE_MAPS_API_KEY TO .ENV</p>
                <p className="text-[9px] text-white/15 mt-1">Google Cloud Console → APIs &amp; Services → Credentials</p>
              </div>
            </div>
          )}

          {/* Active dispatches */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "SREs", count: liveIncidents.reduce((s, i) => s + (i.allocatedResources?.sre ?? 0), 0), icon: "🛠", color: "#ef4444" },
              { label: "SecEng", count: liveIncidents.reduce((s, i) => s + (i.allocatedResources?.seceng ?? 0), 0), icon: "🔒", color: "#3b82f6" },
              { label: "Data Eng", count: liveIncidents.reduce((s, i) => s + (i.allocatedResources?.dataeng ?? 0), 0), icon: "🗄", color: "#f97316" },
              { label: "Drones", count: liveIncidents.reduce((s, i) => s + (i.allocatedResources?.drone ?? 0), 0), icon: "🛸", color: "#a855f7" },
            ].map(d => (
              <div key={d.label} className="bg-[#14181f] border border-white/10 rounded-2xl p-5 flex items-center gap-4">
                <span className="text-3xl">{d.icon}</span>
                <div>
                  <p className="text-3xl font-black" style={{ color: d.color }}>{d.count}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-white/40">{d.label} deployed</p>
                </div>
              </div>
            ))}
          </div>

          {/* Incident response cards */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30">Active Incident Responses</h3>
            {liveIncidents.length === 0 && (
              <p className="text-sm text-white/20 italic">No active incidents — system standing by.</p>
            )}
            {liveIncidents.map(inc => (
              <div key={inc.incidentId} className="bg-[#14181f] border border-white/10 rounded-xl p-4 flex items-center gap-4">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: inc.severity === "critical" ? "#ef4444" : inc.severity === "high" ? "#f97316" : "#3b82f6", boxShadow: `0 0 8px ${inc.severity === "critical" ? "#ef4444" : "#f97316"}` }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{inc.type?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</p>
                  <p className="text-[9px] text-white/40 font-mono">{inc.location?.lat?.toFixed(4)}, {inc.location?.lng?.toFixed(4)} · {Math.round((inc.confidence ?? 0) * 100)}% confidence</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full border" style={{ borderColor: "#22c55e44", color: "#22c55e", background: "#22c55e15" }}>
                    {inc.allocatedResources?.sre ?? 0}🛠 {inc.allocatedResources?.seceng ?? 0}🔒
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── COMMAND VIEW ────────────────────────────────────────────────────── */}
      {activeNav === "command" && (
        <div className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">🎖️</span>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Command Center</h2>
            <div className="ml-auto font-mono text-[10px] text-white/30 uppercase tracking-widest">
              {new Date().toLocaleTimeString("en-US", { hour12: false })} PKT
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Active Incidents", value: liveIncidents.filter(i => i.status === "active").length, sub: "real-time", color: "#ef4444" },
              { label: "Critical", value: liveIncidents.filter(i => i.severity === "critical").length, sub: "priority 1", color: "#f97316" },
              { label: "Units Deployed", value: liveIncidents.reduce((s, i) => s + Object.values(i.allocatedResources ?? {}).reduce((a: number, b) => a + (b as number), 0), 0), sub: "all resources", color: "#3b82f6" },
              { label: "Retracted", value: liveIncidents.filter(i => i.status === "retracted").length, sub: "false alarms", color: "#6b7280" },
            ].map(k => (
              <div key={k.label} className="bg-[#14181f] border border-white/10 rounded-2xl p-5">
                <p className="text-4xl font-black" style={{ color: k.color }}>{k.value}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mt-1">{k.label}</p>
                <p className="text-[8px] text-white/20 mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Priority incident queue */}
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Incident Priority Queue</h3>
            <div className="space-y-2">
              {liveIncidents.length === 0 && (
                <p className="text-sm text-white/20 italic">No incidents in queue.</p>
              )}
              {[...liveIncidents]
                .sort((a, b) => {
                  const sev: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
                  return (sev[b.severity] ?? 0) - (sev[a.severity] ?? 0);
                })
                .map((inc, idx) => (
                  <div key={inc.incidentId} className="bg-[#14181f] border border-white/10 rounded-xl p-4 flex items-center gap-4">
                    <span className="text-lg font-black text-white/20 w-6 text-right flex-shrink-0">#{idx + 1}</span>
                    <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ background: inc.severity === "critical" ? "#ef4444" : inc.severity === "high" ? "#f97316" : inc.severity === "medium" ? "#3b82f6" : "#6b7280" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-bold text-white truncate">{inc.type?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</p>
                        <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded border border-white/10 text-white/40">{inc.status}</span>
                      </div>
                      <p className="text-[9px] text-white/35 font-mono">
                        INC-{inc.incidentId?.slice(0, 8)} · {Math.round((inc.confidence ?? 0) * 100)}% conf · {inc.detectedLanguage ?? "EN"}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-black text-white">{inc.severity?.toUpperCase()}</p>
                      <p className="text-[8px] text-white/30">{new Date(inc.createdAt).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Commander notes */}
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-3">Commander Summaries</h3>
            <div className="space-y-2">
              {liveIncidents.filter(i => (i as any).metadata?.commanderSummary).slice(0, 4).map(inc => (
                <div key={inc.incidentId} className="bg-[#14181f] border border-white/10 rounded-xl p-4">
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1">INC-{inc.incidentId?.slice(0, 8)} · {inc.type}</p>
                  <p className="text-xs text-white/70 leading-relaxed italic">&ldquo;{(inc as any).metadata?.commanderSummary}&rdquo;</p>
                </div>
              ))}
              {liveIncidents.filter(i => (i as any).metadata?.commanderSummary).length === 0 && (
                <p className="text-sm text-white/20 italic">No commander summaries yet — run a scenario to generate AI analysis.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MONITOR VIEW (original content) ─────────────────────────────────── */}
      {activeNav === "monitor" && <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto p-4 md:p-6 gap-6">
        {/* Main Map Container */}
        <div className="flex-1 min-h-[400px] lg:min-h-0 bg-[#14181f] border border-white/10 rounded-[32px] overflow-hidden flex flex-col shadow-2xl relative order-first lg:order-last">
          <div className="absolute top-0 left-0 right-0 p-4 md:p-6 flex flex-col md:flex-row items-center justify-between z-10 pointer-events-none gap-4">
            <div className="flex items-center gap-4 pointer-events-auto bg-[#14181f]/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 shadow-xl w-full md:w-auto overflow-x-auto no-scrollbar">
              <MapIcon className="w-5 h-5 md:w-6 md:h-6 text-[#00e5ff] shrink-0" />
              <h2 className="text-lg md:text-xl font-black tracking-tight text-white uppercase whitespace-nowrap">Incident Map</h2>
              <div className="h-6 w-px bg-white/10 mx-2 shrink-0"></div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => {
                    setProximityMode("radius");
                    setShowProximityOnly(true);
                    setIsSettingEpicenter(!isSettingEpicenter);
                    setIsDrawingPolygon(false);
                  }}
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    proximityMode === "radius" && showProximityOnly ? "bg-[#00e5ff] text-black" : "text-white/40 hover:text-white"
                  )}
                  title="Radius Filter"
                >
                  <CircleIcon className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => {
                    setProximityMode("polygon");
                    setShowProximityOnly(true);
                    setIsDrawingPolygon(!isDrawingPolygon);
                    setIsSettingEpicenter(false);
                  }}
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    isDrawingPolygon ? "bg-yellow-400 text-black animate-pulse" : 
                    (proximityMode === "polygon" && showProximityOnly ? "bg-[#00e5ff] text-black" : "text-white/40 hover:text-white")
                  )}
                  title="Polygon Filter (Click map to draw)"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                {isDrawingPolygon && polygonPoints.length >= 3 && (
                  <button 
                    onClick={() => {
                      const newZone: Zone = {
                        id: `zone-${Date.now()}`,
                        name: `Zone ${zones.length + 1}`,
                        points: [...polygonPoints],
                        type: "critical",
                        color: "#ff4d4d"
                      };
                      setZones(prev => [...prev, newZone]);
                      setPolygonPoints([]);
                      setIsDrawingPolygon(false);
                    }}
                    className="p-1 px-2 bg-green-500 text-black text-[9px] font-black uppercase rounded shadow-lg animate-bounce"
                  >
                    Save
                  </button>
                )}
                {polygonPoints.length > 0 && (
                  <button 
                    onClick={() => {
                      setPolygonPoints([]);
                      setIsDrawingPolygon(false);
                      if (proximityMode === "polygon") setShowProximityOnly(false);
                    }}
                    className="p-1.5 rounded-lg text-error hover:bg-error/10 transition-all"
                    title="Clear Polygon"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button 
                  onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    isFilterMenuOpen ? "bg-[#00e5ff] text-black" : "text-white/40 hover:text-white"
                  )}
                  title="Global Filters"
                >
                  <Filter className="w-4 h-4" />
                </button>
              </div>

              <div className="h-6 w-px bg-white/10 mx-2 shrink-0"></div>
              
              <div className="relative">
                <button 
                  onClick={() => setIsLayerMenuOpen(!isLayerMenuOpen)}
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    isLayerMenuOpen ? "bg-[#00e5ff] text-black" : "text-white/40 hover:text-white"
                  )}
                  title="Map Layers"
                >
                  <Layers className="w-4 h-4" />
                  {Object.values(visibleLayers).some(v => v === true) && (
                    <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-[#00e5ff] rounded-full border border-[#14181f]" />
                  )}
                </button>

                <AnimatePresence>
                  {isLayerMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, x: 10, scale: 0.97 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 10, scale: 0.97 }}
                      className="absolute top-0 right-full mr-2 bg-[#0e1117]/97 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 w-56 pointer-events-auto overflow-hidden"
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
                        <span className="text-[11px] font-black uppercase tracking-widest text-white flex items-center gap-2">
                          <Layers className="w-3.5 h-3.5 text-[#00e5ff]" /> Layers
                        </span>
                        <span className="text-[8px] font-black px-2 py-0.5 rounded-full bg-[#00e5ff]/15 text-[#00e5ff] border border-[#00e5ff]/30 uppercase tracking-wider">Phase II</span>
                      </div>

                      <div className="p-3 space-y-3">
                        {/* CORE section */}
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1.5 px-1">Core</p>
                          {([
                            { key: 'incidents' as const,  label: 'Incidents'  },
                            { key: 'responders' as const, label: 'Responders' },
                            { key: 'clusters' as const,   label: 'Clusters'   },
                          ]).map(({ key, label }) => (
                            <button key={key} onClick={() => toggleLayer(key)}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/5 transition-all">
                              <span className="text-[11px] font-bold text-white/80">{label}</span>
                              <span className={cn(
                                "text-[9px] font-black px-2 py-0.5 rounded-md border transition-all",
                                visibleLayers[key]
                                  ? "bg-[#00e5ff]/15 text-[#00e5ff] border-[#00e5ff]/40"
                                  : "bg-white/5 text-white/30 border-white/10"
                              )}>
                                {visibleLayers[key] ? "ON" : "OFF"}
                              </span>
                            </button>
                          ))}
                        </div>

                        {/* DISASTER section */}
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1.5 px-1">Disaster</p>
                          {([
                            { key: 'heatmap' as const,      label: 'Heatmap'        },
                            { key: 'disasterZones' as const, label: 'Disaster zones' },
                            { key: 'blockedRoads' as const,  label: 'Blocked roads'  },
                          ]).map(({ key, label }) => (
                            <button key={key} onClick={() => toggleLayer(key)}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/5 transition-all">
                              <span className="text-[11px] font-bold text-white/80">{label}</span>
                              <span className={cn(
                                "text-[9px] font-black px-2 py-0.5 rounded-md border transition-all",
                                visibleLayers[key]
                                  ? "bg-[#00e5ff]/15 text-[#00e5ff] border-[#00e5ff]/40"
                                  : "bg-white/5 text-white/30 border-white/10"
                              )}>
                                {visibleLayers[key] ? "ON" : "OFF"}
                              </span>
                            </button>
                          ))}
                        </div>

                        {/* LATER section */}
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-widest text-white/25 mb-1.5 px-1">Later</p>
                          <button onClick={() => toggleLayer('routeLines')}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/5 transition-all">
                            <span className="text-[11px] font-bold text-white/80">Route lines</span>
                            <span className={cn(
                              "text-[9px] font-black px-2 py-0.5 rounded-md border transition-all",
                              visibleLayers.routeLines
                                ? "bg-[#00e5ff]/15 text-[#00e5ff] border-[#00e5ff]/40"
                                : "bg-white/5 text-white/30 border-white/10"
                            )}>
                              {visibleLayers.routeLines ? "ON" : "OFF"}
                            </span>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="h-6 w-px bg-white/10 mx-2 shrink-0"></div>
              <AnimatePresence>
                {isFilterMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full mt-2 bg-[#14181f] border border-white/10 p-4 rounded-2xl shadow-2xl z-50 w-64 pointer-events-auto"
                  >
                    <div className="space-y-4">
                      <div>
                        <span className="text-[10px] font-black uppercase text-white/30 block mb-2">Status</span>
                        <div className="flex flex-wrap gap-2">
                          {assetStatuses.map(status => (
                            <button
                              key={status}
                              onClick={() => setFilterStatuses(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status])}
                              className={cn(
                                "px-2 py-1 rounded-lg text-[9px] font-bold uppercase transition-all border",
                                filterStatuses.includes(status) 
                                  ? "bg-white/10 border-[#00e5ff] text-[#00e5ff]" 
                                  : "bg-white/5 border-transparent text-white/40 hover:text-white"
                              )}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase text-white/30 block mb-2">Unit Type</span>
                        <div className="flex flex-wrap gap-2">
                          {assetTypes.map(type => (
                            <button
                              key={type}
                              onClick={() => setFilterTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])}
                              className={cn(
                                "px-2 py-1 rounded-lg text-[9px] font-bold uppercase transition-all border",
                                filterTypes.includes(type) 
                                  ? "bg-white/10 border-[#00e5ff] text-[#00e5ff]" 
                                  : "bg-white/5 border-transparent text-white/40 hover:text-white"
                              )}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="h-6 w-px bg-white/10 mx-2 shrink-0"></div>
              
              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-black/20 rounded-xl border border-white/5 p-1 pointer-events-auto">
                <button 
                  onClick={() => setZoom(prev => Math.max(1, prev - 1))}
                  className="p-1 px-2 text-white/40 hover:text-white transition-colors"
                  title="Zoom Out"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono font-bold text-[#00e5ff] w-6 text-center">{zoom}x</span>
                <button 
                  onClick={() => setZoom(prev => Math.min(5, prev + 1))}
                  className="p-1 px-2 text-white/40 hover:text-white transition-colors"
                  title="Zoom In"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="h-6 w-px bg-white/10 mx-2 shrink-0"></div>
              <div className="relative shrink-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                <input 
                  type="text" 
                  placeholder="Items..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-black/20 border-none rounded-xl pl-8 md:pl-9 pr-3 py-1.5 text-[10px] md:text-xs text-white w-24 md:w-48 focus:ring-1 focus:ring-[#00e5ff]/50 outline-none"
                />
              </div>
              <button 
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all text-white/60 hover:text-white shrink-0 group"
                title="Export current map data to CSV"
              >
                <Download className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider hidden sm:block">CSV</span>
              </button>
            </div>
            
            {/* Radius Slider Bar (Visible when in radius mode and settings) */}
            {proximityMode === "radius" && showProximityOnly && (
               <div className="mt-3 flex items-center gap-4 bg-black/40 px-4 py-2 rounded-xl border border-white/5 pointer-events-auto">
                 <div className="flex items-center gap-2">
                    <Maximize2 className="w-3.5 h-3.5 text-[#00e5ff]" />
                    <span className="text-[10px] font-black uppercase text-white/40">Radius</span>
                 </div>
                 <input 
                   type="range" 
                   min="5" 
                   max="50" 
                   value={proximityRadius}
                   onChange={(e) => setProximityRadius(parseInt(e.target.value))}
                   className="flex-1 h-1 bg-white/10 rounded-full appearance-none accent-[#00e5ff] cursor-pointer"
                 />
                 <span className="text-[10px] font-mono text-[#00e5ff] font-bold">{proximityRadius}%</span>
                 <button 
                  onClick={() => setIsSettingEpicenter(!isSettingEpicenter)}
                  className={cn("px-2 py-1 rounded bg-white/5 text-[9px] font-black uppercase", isSettingEpicenter && "bg-[#ff4d4d] text-white shadow-[0_0_10px_rgba(255,77,77,0.4)]")}
                >
                  {isSettingEpicenter ? "SETTING..." : "MOVE CENTER"}
                </button>
               </div>
            )}

            {/* Tag Filter Bar */}
            <div className="flex items-center gap-2 mt-3 pointer-events-auto overflow-x-auto no-scrollbar max-w-full">
              {crisisTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => {
                    setSelectedTags(prev => 
                      prev.includes(tag.label) 
                        ? prev.filter(t => t !== tag.label) 
                        : [...prev, tag.label]
                    );
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border shrink-0",
                    selectedTags.includes(tag.label)
                      ? "bg-[#00e5ff] border-[#00e5ff] text-black shadow-[0_0_15px_rgba(0,229,255,0.4)]"
                      : "bg-black/40 border-white/10 text-white/40 hover:text-white/70 hover:border-white/20"
                  )}
                >
                  <span className="text-xs">{tag.icon}</span>
                  {tag.label}
                </button>
              ))}
              {selectedTags.length > 0 && (
                <button 
                  onClick={() => setSelectedTags([])}
                  className="px-2 py-1 text-[8px] font-black uppercase text-[#ff4d4d] hover:text-[#ff3333] transition-colors shrink-0"
                >
                  Clear All
                </button>
              )}
            </div>
          </div>

            <div className="flex-1 relative bg-[#0a0c10] overflow-hidden group/map"
                 onClick={handleMapClick}
                 style={{ cursor: isDrawingPolygon ? 'crosshair' : (isSettingEpicenter ? 'crosshair' : 'default') }}
            >
              {/* ── Google Maps Base Layer ─────────────────────────────────────── */}
              {GMAPS_KEY ? (
                <APIProvider apiKey={GMAPS_KEY}>
                  <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
                    <Map
                      defaultCenter={{ lat: 25, lng: 10 }}
                      defaultZoom={2}
                      gestureHandling="none"
                      disableDefaultUI
                      colorScheme="DARK"
                      className="w-full h-full"
                      mapId="ciro-tactical-map"
                    >
                      {/* Live incident markers + affected-area circles (INCIDENTS layer) */}
                      {visibleLayers.incidents && liveIncidents
                        .filter(i => i.location?.lat && i.location?.lng && i.status !== "retracted")
                        .map(inc => {
                          const unverified = inc.status === "unverified";
                          const color = unverified ? "#f59e0b"
                            : inc.severity === "critical" ? "#ef4444"
                            : inc.severity === "high"     ? "#f97316"
                            : inc.severity === "medium"   ? "#3b82f6"
                            : "#22c55e";
                          return (
                            <React.Fragment key={inc.incidentId}>
                              <Circle
                                center={{ lat: inc.location.lat, lng: inc.location.lng }}
                                radius={inc.radius ?? 1000}
                                strokeColor={color} strokeOpacity={0.7} strokeWeight={2}
                                fillColor={color} fillOpacity={0.08}
                              />
                              <AdvancedMarker position={{ lat: inc.location.lat, lng: inc.location.lng }}>
                                <div style={{
                                  width: 22, height: 22, borderRadius: "50%",
                                  background: `${color}22`,
                                  border: `3px solid ${color}`,
                                  boxShadow: `0 0 14px ${color}`,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: 10,
                                }}>
                                  {unverified ? "❓" : inc.severity === "critical" ? "🔴" : inc.severity === "high" ? "🟠" : "🔵"}
                                </div>
                              </AdvancedMarker>
                            </React.Fragment>
                          );
                        })
                      }
                      {/* Alternate route polylines (ROUTE LINES layer) */}
                      {visibleLayers.routeLines && liveIncidents.flatMap(inc =>
                        (inc.infrastructureRecommendations?.alternativeRoutes ?? [])
                          .filter((r: any) => r.waypoints?.length >= 2)
                          .map((r: any) => (
                            <Polyline
                              key={`tac-route-${inc.incidentId}-${r.id}`}
                              path={r.waypoints.map((w: any) => ({ lat: w.lat, lng: w.lng }))}
                              strokeColor={r.status === "clear" ? "#22c55e" : r.status === "congested" ? "#f97316" : "#ef4444"}
                              strokeOpacity={0.85} strokeWeight={3}
                            />
                          ))
                      )}
                      {/* Blocked road overlays (BLOCKED ROADS layer) */}
                      {visibleLayers.blockedRoads && liveIncidents.flatMap(inc =>
                        (inc.infrastructureRecommendations?.alternativeRoutes ?? [])
                          .filter((r: any) => r.status === "congested" || r.status === "blocked")
                          .flatMap((r: any) => r.waypoints?.length >= 2 ? [
                            <Polyline
                              key={`blocked-${inc.incidentId}-${r.id}`}
                              path={r.waypoints.map((w: any) => ({ lat: w.lat, lng: w.lng }))}
                              strokeColor="#ef4444" strokeOpacity={0.9} strokeWeight={5}
                            />
                          ] : [])
                      )}
                    </Map>
                  </div>
                </APIProvider>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d1117] pointer-events-none" style={{ zIndex: 0 }}>
                  <KeyRound className="w-6 h-6 text-white/10 mb-2" />
                  <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Add VITE_GOOGLE_MAPS_API_KEY to .env</p>
                  <p className="text-[8px] text-white/10 mt-1">Google Cloud Console → APIs & Services → Credentials</p>
                </div>
              )}

              {/* Zoomable Stage Container (SVG tactical overlays) */}
              <motion.div
                animate={{
                  scale: zoom,
                  x: -(alertCenter.x - 50) * (zoom - 1) * 5,
                  y: -(alertCenter.y - 50) * (zoom - 1) * 5
                }}
                transition={{ type: "spring", damping: 25, stiffness: 120 }}
                className="absolute inset-0 origin-center"
                style={{ zIndex: 1 }}
              >

                {/* Polygon / Radius Overlay */}
                {(visibleLayers.disasterZones || visibleLayers.zones) && showProximityOnly && proximityMode === "radius" && (
                  <div 
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#ff4d4d]/20 bg-[#ff4d4d]/5 pointer-events-none"
                    style={{ 
                      left: `${alertCenter.x}%`, top: `${alertCenter.y}%`,
                      width: `${proximityRadius * 2}%`, height: `${proximityRadius * 2}%`
                    }}
                  />
                )}

                {/* Polygon Visualizer */}
                {(visibleLayers.disasterZones || visibleLayers.zones) && (
                  <div className="absolute inset-0 pointer-events-none z-10">
                    <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {/* Saved Zones */}
                      {zones.map(zone => (
                        <g key={zone.id}>
                          <polygon
                            points={zone.points.map(p => `${p.x},${p.y}`).join(' ')}
                            fill={zone.color + "26"} // 15% opacity
                            stroke={zone.color}
                            strokeWidth="0.3"
                            className="transition-all duration-500"
                          />
                          {/* Label */}
                          <text 
                            x={zone.points.reduce((sum, p) => sum + p.x, 0) / zone.points.length}
                            y={zone.points.reduce((sum, p) => sum + p.y, 0) / zone.points.length}
                            fill={zone.color}
                            fontSize="1.5"
                            fontWeight="bold"
                            textAnchor="middle"
                            className="pointer-events-none select-none uppercase opacity-60"
                          >
                            {zone.name}
                          </text>
                        </g>
                      ))}

                      {/* Active Drawing Polygon */}
                      {polygonPoints.length > 0 && (
                        <g>
                          <polygon
                            points={polygonPoints.map(p => `${p.x},${p.y}`).join(' ')}
                            fill={proximityMode === "polygon" && showProximityOnly ? "rgba(0, 229, 255, 0.15)" : "rgba(255, 255, 255, 0.05)"}
                            stroke={proximityMode === "polygon" && showProximityOnly ? "#00e5ff" : "rgba(255, 255, 255, 0.2)"}
                            strokeWidth="0.5"
                            strokeDasharray={isDrawingPolygon ? "1 1" : "none"}
                            className="transition-all duration-300"
                          />
                          {polygonPoints.map((p, idx) => (
                            <circle key={idx} cx={p.x} cy={p.y} r="0.6" fill={isDrawingPolygon ? "#ffd600" : "#00e5ff"} />
                          ))}
                          {isDrawingPolygon && polygonPoints.length >= 3 && (
                            <circle 
                              cx={polygonPoints[0].x} 
                              cy={polygonPoints[0].y} 
                              r="1.2" 
                              fill="none" 
                              stroke="#ffd600" 
                              strokeWidth="0.2" 
                              className="animate-ping"
                            />
                          )}
                        </g>
                      )}
                    </svg>
                  </div>
                )}

                {/* Infrastructure Overlay ─ hospitals, water plants, routes, evacuation */}
                {(visibleLayers.routeLines || visibleLayers.infrastructure) && (
                  <div className="absolute inset-0 pointer-events-none z-20">
                    <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {/* Alternative route lines */}
                      {alternativeRoutes.map(route => (
                        <g key={route.id}>
                          <polyline
                            points={route.points.map(p => `${p.x},${p.y}`).join(' ')}
                            fill="none"
                            stroke={route.status === 'clear' ? '#00e5ff' : route.status === 'congested' ? '#ffd600' : '#ff4d4d'}
                            strokeWidth="0.6"
                            strokeDasharray="2 1"
                            opacity="0.8"
                          />
                          {route.points[0] && (
                            <text x={route.points[0].x + 1} y={route.points[0].y - 0.5}
                              fill={route.status === 'clear' ? '#00e5ff' : '#ffd600'}
                              fontSize="1.2" fontWeight="bold" opacity="0.8"
                              className="select-none">
                              {route.name}
                            </text>
                          )}
                        </g>
                      ))}
                      {/* Infrastructure markers */}
                      {infrastructureMarkers.map(m => {
                        const color = m.type === 'hospital' ? '#ff4d4d'
                          : m.type === 'water_facility' ? '#00e5ff'
                          : '#00ff88';
                        const symbol = m.type === 'hospital' ? '✚'
                          : m.type === 'water_facility' ? '💧'
                          : '⛺';
                        return (
                          <g key={m.id}>
                            <circle cx={m.x} cy={m.y} r="1.8"
                              fill={color + '22'} stroke={color} strokeWidth="0.25" />
                            <text x={m.x} y={m.y + 0.55} textAnchor="middle"
                              fontSize="1.5" className="select-none">{symbol}</text>
                            <text x={m.x} y={m.y + 3} textAnchor="middle"
                              fill={color} fontSize="1.0" fontWeight="bold"
                              className="select-none" opacity="0.85">
                              {m.name.split(' ').slice(0, 2).join(' ')}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                )}

                {/* Traffic Overlay */}
                {(visibleLayers.blockedRoads || visibleLayers.traffic) && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.4 }}
                    className="absolute inset-0 pointer-events-none z-15 mix-blend-screen"
                  >
                    <svg className="w-full h-full" viewBox="0 0 100 100">
                      <line x1="10" y1="20" x2="90" y2="20" stroke="#ffd600" strokeWidth="0.5" strokeDasharray="2 1" />
                      <line x1="10" y1="80" x2="90" y2="80" stroke="#ff4d4d" strokeWidth="0.8" />
                      <line x1="30" y1="0" x2="30" y2="100" stroke="#00e676" strokeWidth="0.3" />
                      <line x1="70" y1="0" x2="70" y2="100" stroke="#ff6b00" strokeWidth="0.6" />
                    </svg>
                  </motion.div>
                )}

                {/* Weather Overlay / Heatmap */}
                {(visibleLayers.heatmap || visibleLayers.weather) && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.3 }}
                    className="absolute inset-0 pointer-events-none z-15"
                  >
                    <div className="absolute top-[20%] left-[30%] w-40 h-40 bg-orange-500/20 rounded-full blur-[60px] animate-pulse" />
                    <div className="absolute top-[60%] left-[50%] w-60 h-60 bg-red-500/10 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '1s' }} />
                  </motion.div>
                )}

                {/* Asset Icons & History Path */}
                <div className="absolute inset-0 pointer-events-none z-20">
                <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {selectedAsset && (
                    <motion.polyline
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 0.6 }}
                      points={selectedAsset.history
                        .filter(h => {
                          if (historyRangeType === "minutes") {
                            return Date.now() - h.timestamp < historyTimeRange * 60 * 1000;
                          } else {
                            const start = historyCustomStart ? new Date(historyCustomStart).getTime() : 0;
                            const end = historyCustomEnd ? new Date(historyCustomEnd).getTime() : Date.now();
                            return h.timestamp >= start && h.timestamp <= end;
                          }
                        })
                        .map(h => `${h.x},${h.y}`)
                        .join(' ')}
                      fill="none"
                      stroke={getStatusColor(selectedAsset.status)}
                      strokeWidth="0.4"
                      strokeDasharray="1 0.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {/* Visual indicator for current location in history context */}
                  {selectedAsset && (
                    <circle 
                      cx={selectedAsset.location.x} 
                      cy={selectedAsset.location.y} 
                      r="0.8" 
                      fill={getStatusColor(selectedAsset.status)} 
                      className="animate-pulse"
                    />
                  )}
                  {/* Scrubbed position indicator */}
                  {selectedAsset && historyPlaybackPercent < 100 && scrubbedPosition && (
                    <g>
                      <circle 
                        cx={scrubbedPosition.x} 
                        cy={scrubbedPosition.y} 
                        r="1.2" 
                        fill="none"
                        stroke={getStatusColor(selectedAsset.status)}
                        strokeWidth="0.2"
                        className="animate-ping opacity-40"
                      />
                      <circle 
                        cx={scrubbedPosition.x} 
                        cy={scrubbedPosition.y} 
                        r="0.6" 
                        fill={getStatusColor(selectedAsset.status)}
                        className="opacity-80"
                      />
                    </g>
                  )}
                </svg>
              </div>

              <AnimatePresence>
                {(visibleLayers.responders || visibleLayers.assets) && clusteredAssets.map((item) => {
                  if (item.type === 'cluster') {
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1/zoom, left: `${item.x}%`, top: `${item.y}%` }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setZoom(prev => Math.min(5, prev + 1));
                          setAlertCenter({ x: item.x, y: item.y });
                        }}
                        className="absolute w-10 h-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer z-30 flex items-center justify-center"
                        style={{ transition: "left 4s linear, top 4s linear" }}
                      >
                        <div className="relative w-full h-full bg-[#3a7bd5]/20 rounded-full border-2 border-[#3a7bd5] backdrop-blur-md shadow-[0_0_20px_rgba(58,123,213,0.4)] flex items-center justify-center group">
                          <div className="absolute inset-0 bg-[#3a7bd5]/20 rounded-full animate-ping opacity-20" />
                          <span className="text-xs font-black text-white">{item.count}</span>
                          
                          {/* Status dots for assets in cluster */}
                          <div className="absolute -bottom-2 flex gap-0.5">
                            {item.assets.slice(0, 4).map((a, i) => (
                               <div key={i} className="w-1.5 h-1.5 rounded-full border border-black/40" style={{ backgroundColor: getStatusColor(a.status) }} />
                            ))}
                            {item.assets.length > 4 && <div className="w-1.5 h-1.5 rounded-full bg-white/40" />}
                          </div>
                        </div>
                      </motion.div>
                    );
                  }

                  const asset = item.assets[0];
                  if (!asset) return null;

                  return (
                    <motion.div
                      key={asset.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, scale: 1/zoom, left: `${asset.location.x}%`, top: `${asset.location.y}%` }}
                      onClick={(e) => { e.stopPropagation(); setSelectedAssetId(asset.id); }}
                      className={cn(
                        "absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 cursor-pointer z-30 flex items-center justify-center",
                        selectedAssetId === asset.id ? "z-40" : ""
                      )}
                      style={{ transition: "left 4s linear, top 4s linear" }}
                    >
                      <div className={cn(
                        "relative p-1.5 bg-[#14181f] rounded-lg border border-white/10 backdrop-blur-sm shadow-xl flex items-center justify-center group overflow-visible transition-all duration-300",
                        selectedAssetId === asset.id ? "border-[#00e5ff] shadow-[0_0_15px_rgba(0,229,255,0.3)] scale-125" : "hover:scale-110"
                      )}>
                        {React.createElement(getAssetIcon(asset.type), { 
                          className: cn("w-3 h-3 text-white/90 group-hover:text-white transition-colors", selectedAssetId === asset.id ? "text-[#00e5ff]" : "text-white/40")
                        })}
                        
                        {/* Status Indicator */}
                        <div 
                          className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-[#14181f] shadow-lg animate-pulse" 
                          style={{ backgroundColor: getStatusColor(asset.status) }} 
                          title={`Status: ${asset.status}`}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              </motion.div>

              {/* Floating Zoom Controls - Bottom Right */}
              <div className="absolute bottom-10 right-10 flex flex-col gap-2 z-50 pointer-events-auto">
                <button 
                  onClick={(e) => { e.stopPropagation(); setZoom(prev => Math.min(5, prev + 1)); }}
                  className="w-10 h-10 bg-[#14181f]/90 backdrop-blur-md border border-white/10 rounded-xl flex items-center justify-center text-white/60 hover:text-[#00e5ff] hover:border-[#00e5ff]/50 transition-all shadow-2xl active:scale-95"
                  title="Zoom In"
                >
                  <Plus className="w-5 h-5" />
                </button>
                <div className="h-10 px-2 bg-[#14181f]/90 backdrop-blur-md border border-white/10 rounded-xl flex items-center justify-center text-[10px] font-black text-[#00e5ff] shadow-2xl">
                  {zoom}x
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); setZoom(prev => Math.max(1, prev - 1)); }}
                  className="w-10 h-10 bg-[#14181f]/90 backdrop-blur-md border border-white/10 rounded-xl flex items-center justify-center text-white/60 hover:text-[#00e5ff] hover:border-[#00e5ff]/50 transition-all shadow-2xl active:scale-95"
                  title="Zoom Out"
                >
                  <Minus className="w-5 h-5" />
                </button>
              </div>


            {/* Bottom Overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 flex items-center gap-3 md:gap-6 bg-gradient-to-t from-[#0a0c10] to-transparent pointer-events-none overflow-x-auto no-scrollbar">
               <div className="flex items-center gap-2 pointer-events-auto shrink-0 bg-black/40 px-2.5 py-1 rounded-lg backdrop-blur-sm">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff4d4d]"></div>
                <span className="text-[10px] font-black text-white/50 uppercase">Crit</span>
              </div>
              <div className="flex items-center gap-2 pointer-events-auto shrink-0 bg-black/40 px-2.5 py-1 rounded-lg backdrop-blur-sm">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff6b00]"></div>
                <span className="text-[10px] font-black text-white/50 uppercase">High</span>
              </div>
              <div className="flex items-center gap-2 pointer-events-auto shrink-0 bg-black/40 px-2.5 py-1 rounded-lg backdrop-blur-sm">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ffd600]"></div>
                <span className="text-[10px] font-black text-white/50 uppercase">Med</span>
              </div>
            </div>
          </div>

          {/* Selected Asset Panel */}
          <AnimatePresence>
            {selectedAsset && (
              <motion.div
                initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
                className="absolute right-0 top-0 bottom-0 w-full sm:w-96 bg-[#14181f]/95 backdrop-blur-2xl border-l border-white/10 p-6 z-50 flex flex-col shadow-2xl"
              >
                <div className="flex justify-between items-center mb-8 shrink-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[7px] font-black uppercase",
                          selectedAsset.type === 'drone' ? "bg-purple-500/20 text-purple-400" :
                          selectedAsset.type === 'unit' ? "bg-green-500/20 text-green-400" :
                          selectedAsset.type === 'medical' ? "bg-red-500/20 text-red-400" :
                          "bg-yellow-500/20 text-yellow-400"
                        )}>
                          {selectedAsset.type}
                        </span>
                        <span className="text-[7px] font-black text-white/20 uppercase tracking-widest">#{selectedAsset.id}</span>
                      </div>
                      <h3 className="text-lg font-black uppercase text-white truncate leading-none">{selectedAsset.name}</h3>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                          <span className="text-[8px] font-black text-white/40 uppercase">Stream Live</span>
                        </div>
                        <div className="h-3 w-px bg-white/10" />
                        <div className="flex items-center gap-1.5">
                           <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getStatusColor(selectedAsset.status) }} />
                           <span className="text-[8px] font-black text-white/60 uppercase">{selectedAsset.status}</span>
                        </div>
                      </div>
                    </div>
                   <button onClick={() => setSelectedAssetId(null)} className="p-2 hover:bg-white/5 rounded-xl transition-all">
                     <X className="w-5 h-5 text-white/20 hover:text-white" />
                   </button>
                </div>
                <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {/* Detailed Stats Grid */}
                    <div className="grid grid-cols-2 gap-3 mb-2">
                      <div className="bg-white/5 p-3 rounded-2xl border border-white/5 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[8px] font-black uppercase text-white/30">Battery</span>
                          <Zap className={cn("w-2.5 h-2.5", selectedAsset.telemetry.battery < 20 ? "text-[#ff4d4d]" : "text-[#00e5ff]")} />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-black text-white">{selectedAsset.telemetry.battery.toFixed(0)}%</span>
                          <div className="h-4 w-12">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={statusHistoryData}>
                                <Line 
                                  type="monotone" 
                                  dataKey="battery" 
                                  stroke={selectedAsset.telemetry.battery < 20 ? "#ff4d4d" : "#00e5ff"} 
                                  strokeWidth={1.5} 
                                  dot={false} 
                                  isAnimationActive={false} 
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white/5 p-3 rounded-2xl border border-white/5 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[8px] font-black uppercase text-white/30">Signal</span>
                          <Wifi className="w-2.5 h-2.5 text-[#00e5ff]" />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-black text-white">{selectedAsset.telemetry.signal.toFixed(0)}%</span>
                          <div className="h-4 w-12">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={statusHistoryData}>
                                <Line 
                                  type="monotone" 
                                  dataKey="signal" 
                                  stroke="#00e5ff" 
                                  strokeWidth={1.5} 
                                  dot={false} 
                                  isAnimationActive={false} 
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white/5 p-3 rounded-2xl border border-white/5 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[8px] font-black uppercase text-white/30">Thermal</span>
                          <Thermometer className="w-2.5 h-2.5 text-[#ff4d4d]" />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-black text-white">{selectedAsset.telemetry.temp.toFixed(1)}°C</span>
                          <div className="h-4 w-12">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={statusHistoryData}>
                                <Line 
                                  type="monotone" 
                                  dataKey="temp" 
                                  stroke="#ff4d4d" 
                                  strokeWidth={1.5} 
                                  dot={false} 
                                  isAnimationActive={false} 
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white/5 p-3 rounded-2xl border border-white/5 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[8px] font-black uppercase text-white/30">Load</span>
                          <Activity className="w-2.5 h-2.5 text-[#ffd600]" />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-black text-white">{selectedAsset.telemetry.load.toFixed(0)}%</span>
                          <div className="h-4 w-12">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={statusHistoryData}>
                                <Line 
                                  type="monotone" 
                                  dataKey="load" 
                                  stroke="#ffd600" 
                                  strokeWidth={1.5} 
                                  dot={false} 
                                  isAnimationActive={false} 
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[8px] font-black uppercase text-white/30 block mb-3">Status Severity Trend</span>
                      <div className="h-28 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={statusHistoryData}>
                            <defs>
                              <linearGradient id="colorLevel" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={getStatusColor(selectedAsset.status)} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={getStatusColor(selectedAsset.status)} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <Tooltip 
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  return (
                                    <div className="bg-[#14181f] border border-white/10 p-2 rounded-lg shadow-xl shrink-0">
                                      <p className="text-[8px] font-black text-white/40 uppercase mb-1">{payload[0].payload.time}</p>
                                      <p className="text-[10px] font-black uppercase" style={{ color: getStatusColor(payload[0].payload.status) }}>
                                        {payload[0].payload.status}
                                      </p>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Area 
                              type="stepAfter" 
                              dataKey="level" 
                              stroke={getStatusColor(selectedAsset.status)} 
                              fillOpacity={1} 
                              fill="url(#colorLevel)" 
                              strokeWidth={2}
                              isAnimationActive={false}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-between mt-2 px-1">
                        <span className="text-[7px] font-black uppercase text-white/20">Historical</span>
                        <span className="text-[7px] font-black uppercase text-white/20">Live</span>
                      </div>
                    </div>

                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="text-[8px] font-black uppercase text-white/30 block mb-3">Historical Movement Trend</span>
                      <div className="h-28 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={statusHistoryData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis dataKey="time" hide />
                            <YAxis hide domain={['auto', 'auto']} />
                            <Tooltip 
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  return (
                                    <div className="bg-[#14181f] border border-white/10 p-2 rounded-lg shadow-xl shrink-0">
                                      <p className="text-[8px] font-black text-white/40 uppercase mb-1">{payload[0].payload.time}</p>
                                      <div className="space-y-1">
                                        <p className="text-[9px] font-black uppercase text-[#00e5ff]">Dist: {payload[0].payload.displacement}m</p>
                                        <p className="text-[8px] font-black uppercase text-white/40">Pos: {payload[0].payload.x}, {payload[0].payload.y}</p>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="displacement" 
                              stroke="#00e5ff" 
                              strokeWidth={2} 
                              dot={false}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-between mt-2 px-1">
                        <span className="text-[7px] font-black uppercase text-white/20">Relative Displacement Path</span>
                      </div>
                    </div>

                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                       <span className="text-[8px] font-black uppercase text-white/30 block mb-3">Telemetry Dynamics</span>
                       <div className="space-y-6">
                          <TelemetrySparkline 
                            data={statusHistoryData} 
                            dataKey="velocity" 
                            color="#38bdf8" 
                            label="Velocity Profile" 
                            unit=" units/s" 
                          />
                          <TelemetrySparkline 
                            data={statusHistoryData} 
                            dataKey="battery" 
                            color={selectedAsset.telemetry.battery < 20 ? "#ff4d4d" : "#00e5ff"} 
                            label="Battery" 
                            unit="%" 
                          />
                          <TelemetrySparkline 
                            data={statusHistoryData} 
                            dataKey="signal" 
                            color="#eab308" 
                            label="Signal Strength" 
                            unit="%" 
                          />
                          <TelemetrySparkline 
                            data={statusHistoryData} 
                            dataKey="load" 
                            color="#fb923c" 
                            label="Operational Load" 
                            unit="%" 
                          />
                          <TelemetrySparkline 
                            data={statusHistoryData} 
                            dataKey="temp" 
                            color="#ff4d4d" 
                            label="Thermal Profile" 
                            unit="°C" 
                          />
                       </div>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[8px] font-black uppercase text-white/30">History Filter</span>
                        <div className="flex items-center gap-1.5">
                           <button 
                             onClick={() => setHistoryRangeType("minutes")}
                             className={cn("text-[8px] font-extrabold px-1.5 py-0.5 rounded transition-all", historyRangeType === "minutes" ? "bg-[#00e5ff] text-black shadow-[0_0_10px_rgba(0,229,255,0.3)]" : "text-white/30 hover:text-white/50")}
                           >
                             MINS
                           </button>
                           <button 
                             onClick={() => setHistoryRangeType("custom")}
                             className={cn("text-[8px] font-extrabold px-1.5 py-0.5 rounded transition-all", historyRangeType === "custom" ? "bg-[#00e5ff] text-black shadow-[0_0_10px_rgba(0,229,255,0.3)]" : "text-white/30 hover:text-white/50")}
                           >
                             CUSTOM
                           </button>
                        </div>
                      </div>
                      
                      {historyRangeType === "minutes" ? (
                        <div className="space-y-4">
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center text-[9px] font-bold uppercase text-white/40">
                              <span>Range window</span>
                              <span className="text-[#00e5ff]">{historyTimeRange} minutes</span>
                            </div>
                            <input 
                              type="range" 
                              min="1" 
                              max="120" 
                              step="1"
                              value={historyTimeRange} 
                              onChange={(e) => {
                                setHistoryTimeRange(parseInt(e.target.value));
                                setHistoryPlaybackPercent(100);
                              }}
                              className="w-full h-1 bg-white/5 rounded-full appearance-none accent-[#00e5ff] cursor-pointer"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                           <div className="space-y-1">
                              <label className="text-[7px] font-black uppercase text-white/20">Start Point</label>
                              <input 
                                type="datetime-local" 
                                className="w-full bg-black/40 border border-white/5 rounded-lg p-2 text-[9px] text-white/80 outline-none focus:border-[#00e5ff]/50 transition-all"
                                value={historyCustomStart}
                                onChange={(e) => {
                                  setHistoryCustomStart(e.target.value);
                                  setHistoryPlaybackPercent(100);
                                }}
                              />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[7px] font-black uppercase text-white/20">End Point</label>
                              <input 
                                type="datetime-local" 
                                className="w-full bg-black/40 border border-white/5 rounded-lg p-2 text-[9px] text-white/80 outline-none focus:border-[#00e5ff]/50 transition-all"
                                value={historyCustomEnd}
                                onChange={(e) => {
                                  setHistoryCustomEnd(e.target.value);
                                  setHistoryPlaybackPercent(100);
                                }}
                              />
                           </div>
                        </div>
                      )}

                      <div className="mt-6 pt-4 border-t border-white/5 space-y-3">
                        <div className="flex justify-between items-center text-[9px] font-bold uppercase text-white/40">
                          <div className="flex items-center gap-2">
                             <History className="w-3 h-3 text-[#00e5ff]" />
                             <span>Playback Scrubber</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center bg-black/40 rounded-lg px-2 py-0.5 border border-white/5 mr-2">
                              {[0.5, 1, 2, 4].map(speed => (
                                <button
                                  key={speed}
                                  onClick={() => setPlaybackSpeed(speed)}
                                  className={cn(
                                    "px-1.5 py-0.5 text-[7px] font-black uppercase transition-all",
                                    playbackSpeed === speed ? "text-[#00e5ff]" : "text-white/20 hover:text-white/40"
                                  )}
                                >
                                  {speed}x
                                </button>
                              ))}
                            </div>
                            <button 
                              onClick={() => {
                                if (historyPlaybackPercent >= 100) setHistoryPlaybackPercent(0);
                                setIsPlaybackRunning(!isPlaybackRunning);
                              }}
                              className="p-1 hover:text-white transition-colors"
                            >
                              {isPlaybackRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                            </button>
                            <button 
                              onClick={() => {
                                setHistoryPlaybackPercent(0);
                                setIsPlaybackRunning(false);
                              }}
                              className="p-1 hover:text-white transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                            <span className={cn(historyPlaybackPercent < 100 ? "text-yellow-400" : "text-[#00e5ff]", "ml-1")}>
                              {historyPlaybackPercent === 100 ? "LIVE" : `${historyPlaybackPercent.toFixed(1)}%`}
                            </span>
                          </div>
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          step="0.5"
                          value={historyPlaybackPercent} 
                          onChange={(e) => setHistoryPlaybackPercent(parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-white/5 rounded-full appearance-none accent-[#00e5ff] cursor-pointer"
                        />
                        <div className="flex justify-between text-[7px] font-black uppercase text-white/20">
                          <span>Historical</span>
                          <button onClick={() => setHistoryPlaybackPercent(100)} className="hover:text-white transition-colors">SET LIVE</button>
                        </div>
                        
                        {historyPlaybackPercent < 100 && scrubbedPosition && (
                          <motion.div 
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-black/40 p-2 rounded-lg border border-yellow-400/20"
                          >
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[7px] font-black uppercase text-white/40">Temporal Context</span>
                              <span className="text-[8px] font-mono font-bold text-yellow-400">
                                {new Date((scrubbedPosition as any).timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[7px] font-black uppercase text-white/40">Coordinates</span>
                              <span className="text-[8px] font-mono font-bold text-white/60">
                                {(scrubbedPosition as any).x.toFixed(1)}, {(scrubbedPosition as any).y.toFixed(1)}
                              </span>
                            </div>
                          </motion.div>
                        )}
                      </div>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-2 mb-3">
                        <Filter className="w-3 h-3 text-white/30" />
                        <span className="text-[8px] font-black uppercase text-white/30">Mission Classifications</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                         {selectedAsset.tags.map(tag => {
                           const tagInfo = crisisTags.find(t => t.label === tag);
                           return (
                             <span key={tag} className="flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[9px] font-black text-white/70 uppercase">
                               <span className="text-xs">{tagInfo?.icon || "🔹"}</span>
                               {tag}
                             </span>
                           );
                         })}
                      </div>
                   </div>
                   <div className="bg-[#00e5ff]/5 border border-[#00e5ff]/20 p-4 rounded-2xl">
                      <div className="flex items-center gap-2 mb-2">
                        <Activity className="w-3 h-3 text-[#00e5ff]" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-[#00e5ff]">Network Link</span>
                       </div>
                       <p className="text-[10px] text-white/60 leading-relaxed italic">Encrypted telemetry stream via node 7-AX.</p>
                    </div>
                </div>
                <div className="pt-6 border-t border-white/5 grid grid-cols-2 gap-3 shrink-0">
                  <button className="py-3 rounded-xl border border-white/10 text-[9px] font-black uppercase text-white/60 hover:bg-white/5">Audio</button>
                  <button className="py-3 rounded-xl bg-[#00e5ff] text-[#0a0c10] text-[9px] font-black uppercase">Dispatch</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Side Panels - intelligence sidebar */}
        <div className="w-full lg:w-1/3 flex flex-col gap-6 lg:h-full lg:overflow-hidden overflow-y-auto shrink-0">
          <div className="bg-[#14181f] border border-white/10 rounded-[32px] p-6 flex flex-col shadow-2xl relative overflow-hidden shrink-0">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-white/5 rounded-lg">
                <Rss className="w-5 h-5 text-[#00e5ff]" />
              </div>
              <h2 className="text-lg font-black tracking-tight text-white/90 uppercase">Signal Input</h2>
            </div>

            {/* Signal type tabs */}
            <div className="grid grid-cols-4 gap-2 mb-4 p-1 bg-black/20 rounded-2xl border border-white/5">
              {signalTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => {
                    setActiveSignalTab(type.id);
                    if (type.id === "ai" && chatMessages.length === 0) {
                      setChatMessages([{ role: "model", content: "Hello, I'm Maestro AI. I'll help you report an incident. What's happening right now?" }]);
                    }
                  }}
                  className={cn(
                    "flex flex-col items-center gap-2 py-3 rounded-xl transition-all",
                    activeSignalTab === type.id
                      ? type.id === "ai" ? "bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/30"
                        : "bg-[#3a7bd5] text-white shadow-lg"
                      : "text-white/30 hover:text-white/60 hover:bg-white/5"
                  )}
                >
                  <type.icon className={cn("w-5 h-5", activeSignalTab === type.id ? "text-white" : "opacity-50")} />
                  <span className="text-[9px] font-black uppercase tracking-wider hidden sm:block">{type.label}</span>
                </button>
              ))}
            </div>

            {/* AI ASSISTANT — Chat Interface */}
            {activeSignalTab === "ai" ? (
              <div className="flex flex-col gap-3">
                {/* Chat bubbles */}
                <div className="flex flex-col gap-2 h-52 overflow-y-auto bg-black/30 border border-white/8 rounded-2xl p-3 custom-scrollbar">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
                        msg.role === "user"
                          ? "bg-[#3a7bd5] text-white rounded-br-sm"
                          : "bg-white/8 text-white/80 border border-white/10 rounded-bl-sm"
                      )}>
                        {msg.role === "model" && (
                          <span className="text-[8px] font-black uppercase tracking-wider text-violet-400 block mb-0.5">Maestro AI</span>
                        )}
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white/8 border border-white/10 rounded-2xl rounded-bl-sm px-3 py-2">
                        <div className="flex gap-1 items-center">
                          <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Ready-to-submit banner */}
                {chatSignal && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-black uppercase text-emerald-400">Report Ready</p>
                      <p className="text-[9px] text-white/50 truncate">{chatSignal.type} · {chatSignal.locationLabel} · {chatSignal.severity}</p>
                    </div>
                    <button
                      onClick={handleChatSubmit}
                      disabled={chatSubmitting}
                      className="px-3 py-1.5 bg-emerald-500 text-white text-[9px] font-black uppercase rounded-lg hover:bg-emerald-400 transition-all flex-shrink-0 disabled:opacity-50"
                    >
                      {chatSubmitting ? "Submitting…" : "Submit"}
                    </button>
                  </motion.div>
                )}

                {/* Input row */}
                <div className="flex gap-2">
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                    placeholder="Describe what you're seeing…"
                    className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/50 transition-all"
                    disabled={chatLoading}
                  />
                  <button
                    onClick={handleChatSend}
                    disabled={chatLoading || !chatInput.trim()}
                    className="px-3 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl hover:opacity-90 transition-all disabled:opacity-40 flex-shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* Clear chat */}
                <button
                  onClick={() => { setChatMessages([]); setChatSignal(null); setChatInput(""); }}
                  className="text-[8px] text-white/20 hover:text-white/50 uppercase tracking-widest font-bold text-center transition-all"
                >
                  Clear conversation
                </button>
              </div>
            ) : (
              /* STANDARD SIGNAL INPUT (Social / Weather / Traffic) */
              <>
                {/* Live-feed header badge */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    {tabLoading ? (
                      <>
                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                          className="w-2.5 h-2.5 border border-[#00e5ff]/40 border-t-[#00e5ff] rounded-full" />
                        <span className="text-[8px] font-black uppercase tracking-widest text-[#00e5ff]/60">
                          Fetching live {activeSignalTab} data…
                        </span>
                      </>
                    ) : signalText && !tabError ? (
                      <>
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400">
                          Live {activeSignalTab === "weather" ? "Open-Meteo" : activeSignalTab === "traffic" ? "Gemini Traffic AI" : "Gemini Social Feed"}
                        </span>
                      </>
                    ) : null}
                  </div>
                  {signalText && !tabLoading && (
                    <button
                      onClick={() => {
                        const ctxType = activeSignalTab === "weather" ? "weather" : activeSignalTab === "traffic" ? "traffic" : "social";
                        setTabLoading(true); setTabError(null);
                        fetch(`/api/data/live-context?type=${ctxType}`)
                          .then(r => r.json()).then(d => { if (d.summary) setSignalText(d.summary); })
                          .catch(() => setTabError("Refresh failed."))
                          .finally(() => setTabLoading(false));
                      }}
                      className="text-[8px] text-white/20 hover:text-[#00e5ff] font-black uppercase tracking-widest transition-all"
                    >↺ Refresh</button>
                  )}
                </div>

                {tabError && (
                  <p className="text-[8px] text-amber-400/70 font-bold mb-2 uppercase tracking-wide">{tabError}</p>
                )}

                <div className="relative">
                  <textarea
                    value={signalText}
                    onChange={(e) => { setSignalText(e.target.value); setDetectedLanguage(null); }}
                    disabled={tabLoading}
                    className={cn(
                      "w-full h-28 bg-black/30 border rounded-2xl p-4 text-sm text-[#e0e0e0] font-medium leading-relaxed resize-none outline-none transition-all placeholder:text-white/10 mb-3",
                      tabLoading ? "border-white/5 opacity-40 cursor-wait" : "border-white/10 focus:border-[#3a7bd5]"
                    )}
                    placeholder={
                      tabLoading ? "Loading live data…"
                        : activeSignalTab === "weather"
                        ? "Weather conditions will load automatically…"
                        : activeSignalTab === "traffic"
                        ? "Traffic intelligence will load automatically…"
                        : "Social media signals will load automatically…"
                    }
                  />
                  {tabLoading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-2xl pointer-events-none">
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        className="w-5 h-5 border-2 border-[#00e5ff]/20 border-t-[#00e5ff] rounded-full" />
                    </div>
                  )}
                </div>

                {/* Language detection badge */}
                {detectedLanguage && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 mb-3">
                    <Globe className="w-3 h-3 text-[#00e5ff]" />
                    <span className="text-[9px] font-black uppercase tracking-wider text-[#00e5ff]">
                      Detected: {detectedLanguage}
                    </span>
                    {isRomanUrdu && (
                      <span className="px-2 py-0.5 bg-[#ffd600]/20 text-[#ffd600] rounded-full text-[8px] font-black uppercase border border-[#ffd600]/30">Roman Urdu</span>
                    )}
                  </motion.div>
                )}

                <button
                  onClick={handleAnalyzeSignal}
                  disabled={isAnalyzing || tabLoading || !signalText.trim()}
                  className="w-full py-4 bg-gradient-to-r from-[#3a7bd5] to-[#00d2ff] text-white font-black uppercase tracking-[0.2em] rounded-2xl text-[10px] shadow-[0_0_20px_rgba(58,123,213,0.3)] hover:shadow-[0_0_30px_rgba(58,123,213,0.5)] transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait mb-4"
                >
                  {isAnalyzing ? (
                    <>
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full" />
                      Running {activeSignalTab === "weather" ? "Weather" : activeSignalTab === "traffic" ? "Traffic" : "Social"} Agents…
                    </>
                  ) : `Ingest ${activeSignalTab === "weather" ? "Weather Signal" : activeSignalTab === "traffic" ? "Traffic Signal" : "Social Signal"}`}
                </button>
              </>
            )}

            {/* Three-source confidence breakdown */}
            {confidenceBreakdown && (
              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="space-y-3 border-t border-white/10 pt-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Confidence — 3 Sources</span>
                  <span className={cn(
                    "text-[9px] font-black px-2 py-0.5 rounded-full border",
                    confidenceBreakdown.displayLevel === 'CRITICAL' ? 'text-[#ff4d4d] border-[#ff4d4d]/40 bg-[#ff4d4d]/10' :
                    confidenceBreakdown.displayLevel === 'HIGH'     ? 'text-[#00e5ff] border-[#00e5ff]/40 bg-[#00e5ff]/10' :
                    confidenceBreakdown.displayLevel === 'MEDIUM'   ? 'text-[#ffd600] border-[#ffd600]/40 bg-[#ffd600]/10' :
                                                                       'text-white/40 border-white/10 bg-white/5'
                  )}>
                    {confidenceBreakdown.displayLevel}
                  </span>
                </div>

                {([
                  { key: 'socialMedia', label: 'Social Media', icon: Rss,      color: '#3a7bd5' },
                  { key: 'weather',     label: 'Weather',       icon: Cloud,    color: '#00d2ff' },
                  { key: 'mapsTraffic', label: 'Maps/Traffic',  icon: Route,    color: '#00e5ff' },
                ] as const).map(({ key, label, icon: Icon, color }) => {
                  const src = confidenceBreakdown[key as keyof ConfidenceBreakdown] as any;
                  if (!src) return null;
                  const pct = Math.round((src.score ?? 0) * 100);
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Icon className="w-3 h-3" style={{ color }} />
                          <span className="text-[9px] font-bold text-white/60 uppercase">{label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[8px] font-black px-1.5 py-0.5 rounded",
                            src.verdict === 'STRONG'   ? 'bg-green-500/20 text-green-400' :
                            src.verdict === 'MODERATE' ? 'bg-yellow-500/20 text-yellow-400' :
                            src.verdict === 'WEAK'     ? 'bg-red-500/20 text-red-400' :
                                                         'bg-white/5 text-white/20'
                          )}>{src.verdict}</span>
                          <span className="text-[10px] font-black font-mono" style={{ color }}>{pct}%</span>
                        </div>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      </div>
                      {src.factors?.[0] && (
                        <p className="text-[8px] text-white/25 truncate">{src.factors[0]}</p>
                      )}
                    </div>
                  );
                })}

                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <span className="text-[9px] font-black uppercase text-white/30">Weighted Score</span>
                  <span className="text-[11px] font-black text-[#00e5ff]">
                    {Math.round((confidenceBreakdown.weightedScore ?? 0) * 100)}%
                  </span>
                </div>

                {/* Infrastructure summary below confidence */}
                {infrastructureMarkers.length > 0 && (
                  <div className="pt-2 border-t border-white/5">
                    <span className="text-[9px] font-black uppercase text-white/30 block mb-2">Nearby Infrastructure</span>
                    <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                      {infrastructureMarkers.slice(0, 6).map(m => (
                        <div key={m.id} className="flex items-center gap-2 py-1">
                          <span className="text-xs shrink-0">
                            {m.type === 'hospital' ? '🏥' : m.type === 'water_facility' ? '💧' : '⛺'}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold text-white/70 truncate">{m.name}</p>
                            <p className="text-[8px] text-white/30 truncate">{m.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </div>

          <div className="hidden lg:flex flex-1 bg-[#14181f] border border-white/10 rounded-[32px] p-6 flex-col shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/5 rounded-lg">
                  <Box className="w-5 h-5 text-[#00e5ff]" />
                </div>
                <h2 className="text-lg font-black tracking-tight text-white/90 uppercase">Tactical Assets & Zones</h2>
              </div>
              <div className="flex gap-2">
                <span className="text-[10px] font-black px-2 py-1 bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/30 rounded-lg">
                  {filteredAssets.length} Assets
                </span>
                <span className="text-[10px] font-black px-2 py-1 bg-yellow-400/20 text-yellow-400 border border-yellow-400/30 rounded-lg">
                  {zones.length} Zones
                </span>
              </div>
            </div>

            <div className="px-1 mb-4 group/search">
               <div className="relative">
                 <Search className={cn(
                   "absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors",
                   searchQuery ? "text-[#00e5ff]" : "text-white/20"
                 )} />
                 <input 
                   type="text" 
                   placeholder="Search assets by name or type..." 
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="w-full bg-black/40 border border-white/5 rounded-2xl pl-10 pr-9 py-2.5 text-[10px] text-white focus:border-[#00e5ff]/50 outline-none transition-all placeholder:text-white/10 group-hover/search:border-white/10"
                 />
                 <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                   {searchQuery && (
                     <button 
                       onClick={() => setSearchQuery("")}
                       className="p-1 text-white/20 hover:text-white transition-colors"
                     >
                       <X className="w-3 h-3" />
                     </button>
                   )}
                   <div className="h-3 w-px bg-white/10" />
                   <Search className="w-3 h-3 text-white/20" />
                 </div>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
              {/* Critical Zones Section */}
              <div className="space-y-3">
                <span className="text-[9px] font-black uppercase text-white/30 block tracking-widest px-1">Defined Critical Zones</span>
                {zones.length === 0 ? (
                  <div className="py-4 px-3 rounded-2xl border border-dashed border-white/5 text-center">
                    <p className="text-[9px] font-bold text-white/20 uppercase">No zones defined</p>
                  </div>
                ) : (
                  zones.map(zone => (
                    <div key={zone.id} className="bg-white/5 border border-white/5 p-3 rounded-2xl flex items-center justify-between group/zone">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: zone.color }} />
                        <div>
                          <h4 className="text-[10px] font-black text-white uppercase">{zone.name}</h4>
                          <p className="text-[8px] font-bold text-white/30 uppercase">{zone.type} Area • {zone.points.length} nodes</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover/zone:opacity-100 transition-opacity">
                         <button 
                           onClick={() => setZones(prev => prev.filter(z => z.id !== zone.id))}
                           className="p-1.5 hover:text-error transition-colors"
                         >
                           <Trash2 className="w-3.5 h-3.5" />
                         </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Assets Section */}
              <div className="space-y-3">
                <span className="text-[9px] font-black uppercase text-white/30 block tracking-widest px-1">Active Tactical Assets</span>
                {filteredAssets.length === 0 ? (
                  <div className="py-12 px-4 rounded-[32px] border border-dashed border-white/5 bg-white/[0.02] text-center flex flex-col items-center justify-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center relative">
                      <div className="absolute inset-0 bg-[#00e5ff]/10 blur-xl rounded-full opacity-50" />
                      <Search className="w-6 h-6 text-white/10" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] font-black text-white/40 uppercase tracking-[0.2em]">Deployment Void</p>
                      <p className="text-[9px] font-medium text-white/20 uppercase">
                        {searchQuery ? `No assets match "${searchQuery}"` : "No assets in range"}
                      </p>
                    </div>
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery("")}
                        className="mt-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[9px] font-black uppercase text-white/60 transition-all active:scale-95"
                      >
                        Reset Search
                      </button>
                    )}
                  </div>
                ) : (
                  filteredAssets.map((asset) => (
                  <div 
                    key={asset.id} 
                    onClick={() => setSelectedAssetId(asset.id)}
                    className={cn(
                      "group bg-white/5 border border-white/5 p-3 rounded-2xl transition-all cursor-pointer hover:border-[#00e5ff]/40",
                      selectedAssetId === asset.id && "bg-[#00e5ff]/5 border-[#00e5ff]/50 shadow-[0_0_15px_rgba(0,229,255,0.1)]"
                    )}
                  >
                    <div className="flex justify-between items-start mb-2">
                       <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-black/40 flex items-center justify-center border border-white/10 group-hover:border-[#00e5ff]/30 transition-colors">
                             {React.createElement(getAssetIcon(asset.type), { 
                               className: cn("w-4 h-4", selectedAssetId === asset.id ? "text-[#00e5ff]" : "text-white/40")
                             })}
                          </div>
                          <div>
                             <h4 className="text-[11px] font-black text-white uppercase">{asset.name}</h4>
                             <p className="text-[9px] font-bold text-white/30 uppercase">{asset.type}</p>
                          </div>
                       </div>
                       <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getStatusColor(asset.status) }} />
                            <span className="text-[9px] font-black uppercase text-white/60">{asset.status}</span>
                          </div>
                          <span className="text-[9px] font-mono text-white/20 uppercase tracking-tighter">
                             LOC: {asset.location.x.toFixed(0)},{asset.location.y.toFixed(0)}
                          </span>
                       </div>
                    </div>
                    
                    <div className="flex items-center gap-3 pt-2 border-t border-white/5 mt-2">
                       <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full transition-all", asset.telemetry.battery < 20 ? "bg-[#ff4d4d]" : "bg-[#00e5ff]")}
                            style={{ width: `${asset.telemetry.battery}%` }}
                          />
                       </div>
                       <span className="text-[9px] font-black text-white/40">{asset.telemetry.battery.toFixed(0)}%</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
      }

    </div>
);
}
