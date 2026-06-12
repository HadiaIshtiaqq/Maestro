const PROD_URL = 'https://nexus-backend-1010212017317.us-central1.run.app';
// Dev: set EXPO_PUBLIC_API_URL in mobile/.env to your machine's LAN address
// (e.g. EXPO_PUBLIC_API_URL=http://192.168.1.50:3000) instead of editing code.
const DEV_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
export const BASE_URL = __DEV__ ? DEV_URL : PROD_URL;

export interface Signal {
  source: string;
  type: string;
  data: any;
  location?: { lat: number; lng: number };
  urgency: number;
}

export interface Incident {
  incidentId: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  location: { lat: number; lng: number };
  radius: number;
  confidence: number;
  detectedLanguage?: string;
  isRomanUrdu?: boolean;
  confidenceBreakdown?: any;
  infrastructureRecommendations?: any;
  allocatedResources?: { ambulance: number; police: number; fire: number; drone: number };
  metadata?: any;
  traceLog?: Array<{ step: string; agent: string; decision: string; reason: string; timestamp: number }>;
  createdAt: string;
  updatedAt: string;
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const api = {
  getActiveCrises: () =>
    req<{ incidents: Incident[]; resourceMap: any; traces: any[] }>('/api/active-crises'),

  getIncident: (id: string) =>
    req<Incident>(`/api/incidents/${id}`),

  ingestSignal: (signal: Partial<Signal>) =>
    req<{ incident?: Incident; trace?: any; message?: string }>('/api/ingest-signal', {
      method: 'POST',
      body: JSON.stringify(signal),
    }),

  verifyIncident: (incidentId: string, status: string, fieldReport?: any) =>
    req<any>('/api/verify-status', {
      method: 'POST',
      body: JSON.stringify({ incidentId, status, fieldReport }),
    }),

  getResources: () =>
    req<any>('/api/resources/status'),
};
