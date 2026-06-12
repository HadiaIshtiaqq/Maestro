import type { LiveIncident, ResourceMap } from '../hooks/useLiveIncidents';

export const MOCK_INCIDENTS: LiveIncident[] = [
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
    infrastructureRecommendations: {
      nearbyHospitals: [
        { id: 'h1', name: 'Aga Khan Hospital', lat: 24.8632, lng: 67.0647, distanceKm: 4.2, bedsAvailable: 32 },
        { id: 'h2', name: 'South City Hospital', lat: 24.8471, lng: 67.0203, distanceKm: 2.1, bedsAvailable: 18 },
      ],
      evacuationPoints: [
        { id: 'e1', name: 'DHA Phase 5 Ground', lat: 24.8560, lng: 67.0100 },
      ],
      alternativeRoutes: [
        { id: 'r1', status: 'clear', waypoints: [{ lat: 24.8607, lng: 67.0011 }, { lat: 24.8632, lng: 67.0647 }] },
        { id: 'r2', status: 'closed', waypoints: [{ lat: 24.8600, lng: 67.0000 }, { lat: 24.8500, lng: 67.0200 }] },
      ],
    },
    traceLog: [
      { step: '1', agent: 'language-agent', decision: 'Detected Roman Urdu distress signals', reason: 'Matched 14 phonetic patterns for "paani", "madad", "doob raha"', timestamp: Date.now() - 300000 },
      { step: '2', agent: 'credibility-agent', decision: 'Corroborated by weather API', reason: 'Open-Meteo reports 62mm rainfall — 3× historical average', timestamp: Date.now() - 240000 },
      { step: '3', agent: 'severity-agent', decision: 'Escalated to CRITICAL', reason: 'Residential zone, 3 hospitals in flood radius, road closures confirmed', timestamp: Date.now() - 180000 },
      { step: '4', agent: 'incident-commander', decision: 'Dispatched 4 ambulances, 6 police, 3 fire, 2 drones', reason: 'Protocol: critical flood in dense residential area', timestamp: Date.now() - 120000 },
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
    confidenceBreakdown: {
      socialMedia:  { score: 0.89, verdict: 'Eyewitness videos circulating on social media' },
      weather:      { score: 0.71, verdict: 'Heavy rain softened foundation soil' },
      mapsTraffic:  { score: 0.82, verdict: 'Emergency vehicles converging on site' },
      weightedScore: 0.87,
      displayLevel:  'CRITICAL',
    },
    allocatedResources: { ambulance: 6, police: 4, fire: 5, drone: 3 },
    infrastructureRecommendations: {
      nearbyHospitals: [
        { id: 'h3', name: 'Liaquat National Hospital', lat: 24.9000, lng: 67.0800, distanceKm: 2.8, bedsAvailable: 45 },
      ],
      evacuationPoints: [
        { id: 'e2', name: 'Gulshan Community Park', lat: 24.9250, lng: 67.0950 },
      ],
      alternativeRoutes: [
        { id: 'r3', status: 'clear', waypoints: [{ lat: 24.9215, lng: 67.0908 }, { lat: 24.9000, lng: 67.0800 }] },
      ],
    },
    traceLog: [
      { step: '1', agent: 'language-agent', decision: 'Urdu distress reports from 3 sources', reason: 'Keywords: "عمارت گری", "لوگ پھنسے ہیں", "امداد بھیجیں"', timestamp: Date.now() - 500000 },
      { step: '2', agent: 'credibility-agent', decision: 'Confirmed via traffic convergence', reason: 'Emergency services already en-route per Maps API', timestamp: Date.now() - 450000 },
      { step: '3', agent: 'severity-agent', decision: 'CRITICAL — potential mass casualty', reason: '6-storey residential building, estimated 40 residents', timestamp: Date.now() - 400000 },
      { step: '4', agent: 'incident-commander', decision: 'Full rescue deployment + NDMA notified', reason: 'Mass casualty protocol triggered automatically', timestamp: Date.now() - 350000 },
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
    confidenceBreakdown: {
      socialMedia:  { score: 0.78, verdict: 'News outlet reports confirmed' },
      weather:      { score: 0.85, verdict: 'Wind 28km/h — rapid fire spread risk' },
      mapsTraffic:  { score: 0.79, verdict: 'Evacuation routes active' },
      weightedScore: 0.82,
      displayLevel:  'HIGH',
    },
    allocatedResources: { ambulance: 3, police: 5, fire: 8, drone: 2 },
    infrastructureRecommendations: {
      nearbyHospitals: [
        { id: 'h4', name: 'SITE Hospital', lat: 24.8950, lng: 67.0100, distanceKm: 1.6, bedsAvailable: 12 },
      ],
      evacuationPoints: [
        { id: 'e3', name: 'SITE Sports Complex', lat: 24.8880, lng: 66.9900 },
      ],
      alternativeRoutes: [
        { id: 'r4', status: 'clear', waypoints: [{ lat: 24.8900, lng: 66.9950 }, { lat: 24.8950, lng: 67.0100 }] },
        { id: 'r5', status: 'closed', waypoints: [{ lat: 24.8910, lng: 66.9940 }, { lat: 24.8800, lng: 66.9800 }] },
      ],
    },
    traceLog: [
      { step: '1', agent: 'language-agent', decision: 'English fire emergency reports', reason: 'News outlets + Twitter activity spike in SITE area', timestamp: Date.now() - 700000 },
      { step: '2', agent: 'credibility-agent', decision: 'HIGH confidence', reason: 'Multiple independent sources, thermal anomaly on satellite', timestamp: Date.now() - 650000 },
      { step: '3', agent: 'severity-agent', decision: 'HIGH — chemical plant proximity', reason: 'Adjacent chemical storage, residential zone 400m east', timestamp: Date.now() - 600000 },
      { step: '4', agent: 'incident-commander', decision: '8 fire units deployed, 500m evacuation ordered', reason: 'Chemical fire protocol — expand perimeter', timestamp: Date.now() - 550000 },
    ],
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
    traceLog: [
      { step: '1', agent: 'language-agent', decision: 'Roman Urdu accident report', reason: 'Phonetic match: "accident", "hospital lejao", "khoon"', timestamp: Date.now() - 900000 },
      { step: '2', agent: 'credibility-agent', decision: 'MEDIUM confidence — single source', reason: 'No traffic anomaly corroboration yet', timestamp: Date.now() - 870000 },
      { step: '3', agent: 'severity-agent', decision: 'MEDIUM — multi-vehicle on arterial road', reason: '3 vehicles reported, major artery, peak hour', timestamp: Date.now() - 840000 },
    ],
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
    traceLog: [
      { step: '1', agent: 'language-agent', decision: 'Widespread outage reports', reason: 'High-volume "no electricity", "load shedding" in North Karachi', timestamp: Date.now() - 1200000 },
      { step: '2', agent: 'credibility-agent', decision: 'HIGH confidence', reason: 'NEPRA outage data corroborated + hospital backup alerts', timestamp: Date.now() - 1150000 },
      { step: '3', agent: 'severity-agent', decision: 'HIGH — hospitals at risk', reason: '3 hospitals in blackout zone, generators at 40% capacity', timestamp: Date.now() - 1100000 },
      { step: '4', agent: 'incident-commander', decision: 'WAPDA emergency team dispatched + drone surveillance', reason: 'Grid failure affecting medical infrastructure', timestamp: Date.now() - 1050000 },
    ],
    createdAt: new Date(Date.now() - 1200000).toISOString(),
    updatedAt: new Date(Date.now() - 400000).toISOString(),
  },
];

export const MOCK_RESOURCES: ResourceMap = {
  pool:      { ambulance: 20, police: 40, fire: 25, drone: 12 },
  available: { ambulance: 4,  police: 20, fire: 9,  drone: 0  },
};
