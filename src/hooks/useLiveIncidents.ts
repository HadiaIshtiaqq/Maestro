import { useState, useEffect, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { MOCK_INCIDENTS, MOCK_RESOURCES } from "../mocks/incidents";

export interface LiveIncident {
  incidentId:   string;
  type:         string;
  severity:     "low" | "medium" | "high" | "critical";
  status:       string;
  location:     { lat: number; lng: number };
  radius:       number;
  confidence:   number;
  detectedLanguage?: string;
  isRomanUrdu?: boolean;
  confidenceBreakdown?: {
    socialMedia:  { score: number; verdict: string };
    weather:      { score: number; verdict: string };
    mapsTraffic:  { score: number; verdict: string };
    weightedScore: number;
    displayLevel:  string;
  };
  infrastructureRecommendations?: any;
  allocatedResources?: { ambulance: number; police: number; fire: number; drone: number };
  traceLog?: Array<{ step: string; agent: string; decision: string; reason: string; timestamp: number }>;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceMap {
  pool?: Record<string, number>;
  available?: Record<string, number>;
}

let _socket: Socket | null = null;
function getSocket(): Socket {
  if (!_socket) {
    _socket = io({ transports: ["websocket"] });
  }
  return _socket;
}

export interface AutonomousActionLog {
  type:       string;
  incidentId: string;
  actions:    string[];
  timestamp:  string;
}

export function useLiveIncidents() {
  const [incidents, setIncidents]         = useState<LiveIncident[]>([]);
  const [resources, setResources]         = useState<ResourceMap>({});
  const [latestTrace, setLatestTrace]     = useState<any>(null);
  const [loading, setLoading]             = useState(true);
  const [newestId, setNewestId]           = useState<string | null>(null);
  const [autonomousActions, setAutonomousActions] = useState<AutonomousActionLog[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch("/api/active-crises");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setIncidents(data.incidents ?? []);
      setResources({ pool: data.resourceMap?.pool, available: data.resourceMap?.available });
    } catch {
      setIncidents(MOCK_INCIDENTS);
      setResources(MOCK_RESOURCES);
    }
  }, []);

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));

    const socket = getSocket();

    socket.on("incident:created", (incident: LiveIncident) => {
      setIncidents(prev => {
        const exists = prev.some(i => i.incidentId === incident.incidentId);
        return exists ? prev : [incident, ...prev];
      });
      setNewestId(incident.incidentId);
      if (incident.traceLog) setLatestTrace(incident.traceLog);
    });

    socket.on("incident:updated", (incident: LiveIncident) => {
      setIncidents(prev => prev.map(i => i.incidentId === incident.incidentId ? incident : i));
      if (incident.traceLog) setLatestTrace(incident.traceLog);
    });

    socket.on("incident:retracted", ({ incidentId }: { incidentId: string }) => {
      setIncidents(prev => prev.map(i =>
        i.incidentId === incidentId ? { ...i, status: "retracted" } : i
      ));
    });

    socket.on("resources:updated", (data: any) => {
      setResources({ pool: data.pool, available: data.available });
    });

    socket.on("autonomous:action", (data: AutonomousActionLog) => {
      setAutonomousActions(prev => [data, ...prev].slice(0, 20));
    });

    // Reconnection: re-fetch on reconnect to catch missed events
    socket.on("connect", () => fetchAll());

    return () => {
      socket.off("incident:created");
      socket.off("incident:updated");
      socket.off("incident:retracted");
      socket.off("resources:updated");
      socket.off("autonomous:action");
      socket.off("connect");
    };
  }, [fetchAll]);

  return { incidents, resources, latestTrace, loading, newestId, autonomousActions, refresh: fetchAll };
}
