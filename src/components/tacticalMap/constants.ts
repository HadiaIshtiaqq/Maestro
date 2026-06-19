import { Bot, Car, Cloud, Rss } from "lucide-react";
import { getGoogleMapsApiKey } from "../../lib/googleMaps";

export const GMAPS_KEY = getGoogleMapsApiKey();

export const signalTypes = [
  { id: "social", icon: Rss, label: "SIEM" },
  { id: "weather", icon: Cloud, label: "Monitoring" },
  { id: "traffic", icon: Car, label: "Ticketing" },
  { id: "ai", icon: Bot, label: "AI Assistant" },
];

export const crisisTags = [
  { id: "flood_en", label: "Security", icon: "🌊" },
  { id: "flood_ur", label: "Outage", icon: "🌊" },
  { id: "data", label: "Data", icon: "🗄" },
  { id: "accident", label: "Accident", icon: "💥" },
  { id: "infra_fail", label: "Infra Fail", icon: "🏗️" },
  { id: "road_block", label: "Road Block", icon: "🚧" },
];

export const LAT_MIN = 24.75;
export const LAT_MAX = 25.10;
export const LNG_MIN = 66.85;
export const LNG_MAX = 67.30;

export const lngToX = (lng: number) => ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * 90 + 5;
export const latToY = (lat: number) => ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * 90 + 5;

export interface TacticalAsset {
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
    telemetry?: { battery: number; signal: number; load: number; temp: number };
  }[];
  telemetry: { battery: number; signal: number; load: number; temp: number };
}

export interface TacticalZone {
  id: string;
  name: string;
  points: { x: number; y: number }[];
  type: "critical" | "alert" | "deployment";
  color: string;
}
