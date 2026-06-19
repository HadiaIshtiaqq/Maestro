/**
 * Shared mock incident fixtures for web dashboard and mobile app.
 */

export interface MockIncidentFixture {
  incidentId: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: string;
  location: { lat: number; lng: number };
  radius: number;
  confidence: number;
  detectedLanguage?: string;
  isRomanUrdu?: boolean;
  confidenceBreakdown?: {
    socialMedia: { score: number; verdict: string };
    weather: { score: number; verdict: string };
    mapsTraffic: { score: number; verdict: string };
    weightedScore: number;
    displayLevel: string;
  };
  allocatedResources?: { ambulance: number; police: number; fire: number; drone: number };
  infrastructureRecommendations?: Record<string, unknown>;
  traceLog?: Array<{ step: string; agent: string; decision: string; reason: string; timestamp: number }>;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const MOCK_INCIDENT_FIXTURES: MockIncidentFixture[] = [
  {
    incidentId: 'mock-001',
    type: 'Flash Flood',
    severity: 'critical',
    status: 'active',
    location: { lat: 24.8607, lng: 67.0011 },
    radius: 800,
    confidence: 0.93,
    detectedLanguage: 'Roman Urdu',
    isRomanUrdu: true,
    confidenceBreakdown: {
      socialMedia:  { score: 0.91, verdict: 'High volume of distress reports' },
      weather:      { score: 0.97, verdict: '62mm rainfall in 3 hours — 3× average' },
      mapsTraffic:  { score: 0.88, verdict: 'All routes to DHA blocked' },
      weightedScore: 0.93,
      displayLevel:  'CRITICAL',
    },
    allocatedResources: { ambulance: 4, police: 6, fire: 3, drone: 2 },
    traceLog: [
      { step: '1', agent: 'language-agent', decision: 'Detected Roman Urdu distress signals', reason: 'Matched 14 phonetic patterns', timestamp: Date.now() - 300000 },
      { step: '2', agent: 'credibility-agent', decision: 'Corroborated by weather API', reason: 'Open-Meteo reports 62mm rainfall', timestamp: Date.now() - 240000 },
      { step: '3', agent: 'severity-agent', decision: 'Escalated to CRITICAL', reason: 'Residential zone in flood radius', timestamp: Date.now() - 180000 },
      { step: '4', agent: 'incident-commander', decision: 'Dispatched resources', reason: 'Critical flood protocol', timestamp: Date.now() - 120000 },
    ],
    createdAt: new Date(Date.now() - 300000).toISOString(),
    updatedAt: new Date(Date.now() - 60000).toISOString(),
  },
  {
    incidentId: 'mock-002',
    type: 'Building Collapse',
    severity: 'critical',
    status: 'active',
    location: { lat: 24.9215, lng: 67.0908 },
    radius: 300,
    confidence: 0.87,
    detectedLanguage: 'Urdu',
    isRomanUrdu: false,
    allocatedResources: { ambulance: 6, police: 4, fire: 5, drone: 3 },
    traceLog: [
      { step: '1', agent: 'language-agent', decision: 'Urdu distress reports', reason: 'Multiple sources', timestamp: Date.now() - 500000 },
      { step: '2', agent: 'credibility-agent', decision: 'Confirmed via traffic', reason: 'Emergency services en-route', timestamp: Date.now() - 450000 },
    ],
    createdAt: new Date(Date.now() - 500000).toISOString(),
    updatedAt: new Date(Date.now() - 100000).toISOString(),
  },
  {
    incidentId: 'mock-003',
    type: 'Industrial Fire',
    severity: 'high',
    status: 'active',
    location: { lat: 24.8900, lng: 66.9950 },
    radius: 500,
    confidence: 0.82,
    detectedLanguage: 'English',
    allocatedResources: { ambulance: 3, police: 5, fire: 8, drone: 2 },
    createdAt: new Date(Date.now() - 700000).toISOString(),
    updatedAt: new Date(Date.now() - 200000).toISOString(),
  },
  {
    incidentId: 'mock-004',
    type: 'Road Accident',
    severity: 'medium',
    status: 'unverified',
    location: { lat: 24.8615, lng: 67.0648 },
    radius: 100,
    confidence: 0.64,
    detectedLanguage: 'Roman Urdu',
    isRomanUrdu: true,
    allocatedResources: { ambulance: 2, police: 2, fire: 0, drone: 1 },
    createdAt: new Date(Date.now() - 900000).toISOString(),
    updatedAt: new Date(Date.now() - 800000).toISOString(),
  },
  {
    incidentId: 'mock-005',
    type: 'Power Grid Failure',
    severity: 'high',
    status: 'active',
    location: { lat: 24.9480, lng: 67.1120 },
    radius: 2000,
    confidence: 0.78,
    detectedLanguage: 'English',
    allocatedResources: { ambulance: 1, police: 3, fire: 0, drone: 4 },
    createdAt: new Date(Date.now() - 1200000).toISOString(),
    updatedAt: new Date(Date.now() - 400000).toISOString(),
  },
];

export const MOCK_RESOURCE_FIXTURES = {
  pool:      { ambulance: 20, police: 40, fire: 25, drone: 12 },
  available: { ambulance: 4,  police: 20, fire: 9,  drone: 0  },
};
