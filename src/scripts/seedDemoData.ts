import { Incident } from '../models/index';
import { resourceManager } from '../services/resourceManager';
import { eventBus } from '../events/eventBus';

export async function seedDemoIncidents(): Promise<void> {
  const existing = await Incident.countDocuments({ status: { $nin: ['closed', 'retracted'] } });
  if (existing > 0) {
    console.log(`[Seed] ${existing} active incidents already in DB — skipping seed`);
    return;
  }

  const now = Date.now();

  const docs = [
    {
      incidentId: 'demo-001',
      type: 'Flash Flood',
      severity: 'critical',
      status: 'active',
      location: { lat: 24.8607, lng: 67.0011 },
      radius: 800,
      confidence: 0.93,
      detectedLanguage: 'Roman Urdu',
      isRomanUrdu: true,
      confidenceBreakdown: {
        socialMedia:   { score: 0.91, weight: 0.4, factors: ['14 distress posts', 'viral video'], verdict: 'High volume of distress reports' },
        weather:       { score: 0.97, weight: 0.4, factors: ['62mm rainfall in 3 hrs'], verdict: '62mm rainfall — 3× historical average' },
        mapsTraffic:   { score: 0.88, weight: 0.2, factors: ['all DHA routes blocked'], verdict: 'All routes to DHA Phase 5 blocked' },
        weightedScore: 0.93,
        displayLevel:  'CRITICAL',
      },
      allocatedResources: { ambulance: 4, police: 6, fire: 3, drone: 2 },
      infrastructureRecommendations: {
        nearbyHospitals: [
          { id: 'h1', name: 'Aga Khan University Hospital', lat: 24.8632, lng: 67.0647, distanceKm: 4.2, bedsAvailable: 32, hasTraumaUnit: true, hasCooling: true, phone: '021-34930051' },
          { id: 'h2', name: 'South City Hospital', lat: 24.8471, lng: 67.0203, distanceKm: 2.1, bedsAvailable: 18, hasTraumaUnit: false, hasCooling: true, phone: '021-35870316' },
        ],
        evacuationPoints: [
          { id: 'e1', name: 'DHA Phase 5 Community Ground', lat: 24.8560, lng: 67.0100, capacity: 2000, type: 'open_ground' },
        ],
        waterFacilities: [
          { id: 'w1', name: 'KWSB Pumping Station Phase 5', type: 'pumping_station', lat: 24.8580, lng: 67.0050, status: 'overloaded', capacity: '45 MGD' },
        ],
        alternativeRoutes: [
          { id: 'r1', name: 'Korangi Industrial Route', status: 'clear',  description: 'Via Korangi Road — adds 12 min', waypoints: [{ lat: 24.8607, lng: 67.0011 }, { lat: 24.8650, lng: 67.0300 }, { lat: 24.8632, lng: 67.0647 }] },
          { id: 'r2', name: 'Clifton Bridge Route',     status: 'closed', description: 'Flooded underpass — avoid',    waypoints: [{ lat: 24.8600, lng: 67.0000 }, { lat: 24.8500, lng: 67.0200 }] },
        ],
        emergencyContacts: [
          { agency: 'Edhi Foundation', number: '115', type: 'ambulance' },
          { agency: 'Rescue 1122', number: '1122', type: 'rescue' },
        ],
      },
      traceLog: [
        { step: 'STEP_01', agent: 'language-agent',     decision: 'Detected Roman Urdu distress signals',              reason: 'Matched 14 phonetic patterns: "paani", "madad", "doob raha"', timestamp: now - 300000 },
        { step: 'STEP_02', agent: 'credibility-agent',  decision: 'Corroborated by weather + traffic APIs',            reason: 'Open-Meteo: 62mm/3hrs; Maps API: 4 blocked routes confirmed', timestamp: now - 240000 },
        { step: 'STEP_03', agent: 'severity-agent',     decision: 'Escalated to CRITICAL',                             reason: 'Residential zone; 3 hospitals in flood radius; road closures confirmed', timestamp: now - 180000 },
        { step: 'STEP_04', agent: 'incident-commander', decision: 'Dispatched 4 ambulances, 6 police, 3 fire, 2 drones', reason: 'Protocol: critical flood in dense residential area', timestamp: now - 120000 },
      ],
      metadata: { area: 'Defence Housing Authority, Phase 5', source: 'Social Media + Weather API', commanderSummary: 'Critical flash flood in DHA Phase 5. 4 ambulances, 6 police units, 3 fire trucks, 2 drones deployed. Evacuation order in effect for low-lying areas.' },
      createdAt: new Date(now - 300000),
      updatedAt: new Date(now - 60000),
    },
    {
      incidentId: 'demo-002',
      type: 'Building Collapse',
      severity: 'critical',
      status: 'active',
      location: { lat: 24.9215, lng: 67.0908 },
      radius: 300,
      confidence: 0.87,
      detectedLanguage: 'Urdu',
      isRomanUrdu: false,
      confidenceBreakdown: {
        socialMedia:   { score: 0.89, weight: 0.4, factors: ['eyewitness videos', '3 news outlets'], verdict: 'Confirmed by multiple independent sources' },
        weather:       { score: 0.71, weight: 0.4, factors: ['heavy rain 48hrs', 'soil saturation'], verdict: 'Heavy rain softened foundation soil' },
        mapsTraffic:   { score: 0.82, weight: 0.2, factors: ['emergency vehicles converging'], verdict: 'Emergency services already en-route' },
        weightedScore: 0.87,
        displayLevel:  'CRITICAL',
      },
      allocatedResources: { ambulance: 6, police: 4, fire: 5, drone: 3 },
      infrastructureRecommendations: {
        nearbyHospitals: [
          { id: 'h3', name: 'Liaquat National Hospital', lat: 24.9000, lng: 67.0800, distanceKm: 2.8, bedsAvailable: 45, hasTraumaUnit: true, hasCooling: false, phone: '021-99201300' },
        ],
        evacuationPoints: [
          { id: 'e2', name: 'Gulshan Community Park', lat: 24.9250, lng: 67.0950, capacity: 1500, type: 'park' },
        ],
        waterFacilities: [],
        alternativeRoutes: [
          { id: 'r3', name: 'University Road Bypass', status: 'clear', description: 'Via Nipa Chowrangi — 8 min ETA', waypoints: [{ lat: 24.9215, lng: 67.0908 }, { lat: 24.9100, lng: 67.0850 }, { lat: 24.9000, lng: 67.0800 }] },
        ],
        emergencyContacts: [
          { agency: 'NDMA', number: '1700', type: 'disaster_management' },
          { agency: 'Chhipa Rescue', number: '1020', type: 'rescue' },
        ],
      },
      traceLog: [
        { step: 'STEP_01', agent: 'language-agent',     decision: 'Urdu distress confirmed from 3 sources',          reason: 'Keywords: "عمارت گری", "لوگ پھنسے ہیں", "امداد بھیجیں"', timestamp: now - 500000 },
        { step: 'STEP_02', agent: 'credibility-agent',  decision: 'HIGH confidence — multi-source corroboration',   reason: 'Videos + news API + Maps emergency route activity', timestamp: now - 450000 },
        { step: 'STEP_03', agent: 'severity-agent',     decision: 'CRITICAL — potential mass casualty event',        reason: '6-storey residential; ~40 residents; rescue dogs requested', timestamp: now - 400000 },
        { step: 'STEP_04', agent: 'incident-commander', decision: 'Full rescue deployment; NDMA and PDMA notified',  reason: 'Mass casualty protocol: >20 potential casualties', timestamp: now - 350000 },
      ],
      metadata: { area: 'Gulshan-e-Iqbal Block 13-D', source: 'Social Media + Field Report', commanderSummary: 'Critical building collapse in Gulshan-e-Iqbal. 6-storey residential structure. Mass casualty protocol activated. NDMA notified.' },
      createdAt: new Date(now - 500000),
      updatedAt: new Date(now - 100000),
    },
    {
      incidentId: 'demo-003',
      type: 'Industrial Fire',
      severity: 'high',
      status: 'active',
      location: { lat: 24.8900, lng: 66.9950 },
      radius: 500,
      confidence: 0.82,
      detectedLanguage: 'English',
      isRomanUrdu: false,
      confidenceBreakdown: {
        socialMedia:   { score: 0.78, weight: 0.4, factors: ['news outlets', 'Twitter spike'], verdict: 'Confirmed by news outlets' },
        weather:       { score: 0.85, weight: 0.4, factors: ['wind 28km/h NE', 'low humidity'], verdict: 'Wind 28 km/h — rapid fire spread risk HIGH' },
        mapsTraffic:   { score: 0.79, weight: 0.2, factors: ['evacuation routes active'], verdict: 'Evacuation corridors established' },
        weightedScore: 0.82,
        displayLevel:  'HIGH',
      },
      allocatedResources: { ambulance: 3, police: 5, fire: 8, drone: 2 },
      infrastructureRecommendations: {
        nearbyHospitals: [
          { id: 'h4', name: 'SITE Hospital', lat: 24.8950, lng: 67.0100, distanceKm: 1.6, bedsAvailable: 12, hasTraumaUnit: false, hasCooling: false, phone: '021-32563001' },
        ],
        evacuationPoints: [
          { id: 'e3', name: 'SITE Sports Complex', lat: 24.8880, lng: 66.9900, capacity: 3000, type: 'sports_ground' },
        ],
        waterFacilities: [],
        alternativeRoutes: [
          { id: 'r4', name: 'Orangi Town Road',    status: 'clear',  description: 'Northern bypass — clear',        waypoints: [{ lat: 24.8900, lng: 66.9950 }, { lat: 24.8950, lng: 67.0100 }] },
          { id: 'r5', name: 'SITE Main Boulevard', status: 'closed', description: 'Smoke cover — road closed',     waypoints: [{ lat: 24.8910, lng: 66.9940 }, { lat: 24.8800, lng: 66.9800 }] },
        ],
        emergencyContacts: [
          { agency: 'KFB Fire Brigade', number: '16', type: 'fire' },
          { agency: 'SITE Police', number: '021-32563499', type: 'police' },
        ],
      },
      traceLog: [
        { step: 'STEP_01', agent: 'language-agent',     decision: 'English fire emergency from media + social', reason: 'News outlets + Twitter spike in SITE Industrial Area', timestamp: now - 700000 },
        { step: 'STEP_02', agent: 'credibility-agent',  decision: 'HIGH confidence — thermal anomaly confirmed', reason: 'Multiple sources; smoke visible on open satellite imagery', timestamp: now - 650000 },
        { step: 'STEP_03', agent: 'severity-agent',     decision: 'HIGH — chemical plant proximity flagged',     reason: 'Adjacent chemical storage; residential zone 400m east; wind towards homes', timestamp: now - 600000 },
        { step: 'STEP_04', agent: 'incident-commander', decision: '8 fire units; 500m evacuation ordered',       reason: 'Chemical fire protocol: expand perimeter; hazmat team en-route', timestamp: now - 550000 },
      ],
      metadata: { area: 'SITE Industrial Area, Sector 12', source: 'News API + Social Media', commanderSummary: 'High-severity industrial fire in SITE. Chemical hazard risk. 8 fire units deployed, 500m evacuation in effect.' },
      createdAt: new Date(now - 700000),
      updatedAt: new Date(now - 200000),
    },
    {
      incidentId: 'demo-004',
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
        { step: 'STEP_01', agent: 'language-agent',    decision: 'Roman Urdu accident report — single source', reason: 'Phonetic match: "accident", "hospital lejao", "khoon beh raha"', timestamp: now - 900000 },
        { step: 'STEP_02', agent: 'credibility-agent', decision: 'MEDIUM confidence — awaiting corroboration', reason: 'Single social source; no traffic anomaly in Maps API yet', timestamp: now - 870000 },
        { step: 'STEP_03', agent: 'severity-agent',    decision: 'MEDIUM — multi-vehicle on major artery',     reason: '3 vehicles involved; Shahrae Faisal peak hour', timestamp: now - 840000 },
      ],
      metadata: { area: 'Shahrae Faisal near KESC', source: 'Social Media' },
      createdAt: new Date(now - 900000),
      updatedAt: new Date(now - 800000),
    },
    {
      incidentId: 'demo-005',
      type: 'Power Grid Failure',
      severity: 'high',
      status: 'active',
      location: { lat: 24.9480, lng: 67.1120 },
      radius: 2000,
      confidence: 0.78,
      detectedLanguage: 'English',
      isRomanUrdu: false,
      confidenceBreakdown: {
        socialMedia:   { score: 0.76, weight: 0.4, factors: ['"no electricity"', '"bijli gai"', 'volume spike'], verdict: 'High-volume outage complaints' },
        weather:       { score: 0.72, weight: 0.4, factors: ['lightning storm', 'surge risk'], verdict: 'Active thunderstorm — grid surge plausible' },
        mapsTraffic:   { score: 0.81, weight: 0.2, factors: ['traffic signals offline', 'dark streets'], verdict: 'Traffic signal failures corroborate blackout' },
        weightedScore: 0.78,
        displayLevel:  'HIGH',
      },
      allocatedResources: { ambulance: 1, police: 3, fire: 0, drone: 4 },
      traceLog: [
        { step: 'STEP_01', agent: 'language-agent',     decision: 'Widespread outage reports — English + Urdu',  reason: '"no electricity", "bijli gai" spike — North Karachi Sectors 11-C to 14-B', timestamp: now - 1200000 },
        { step: 'STEP_02', agent: 'credibility-agent',  decision: 'HIGH confidence — utility API corroboration', reason: 'NEPRA outage data + hospital backup generator alerts', timestamp: now - 1150000 },
        { step: 'STEP_03', agent: 'severity-agent',     decision: 'HIGH — 3 hospitals in blackout zone',         reason: 'Generators at 40% capacity; critical medical infrastructure at risk', timestamp: now - 1100000 },
        { step: 'STEP_04', agent: 'incident-commander', decision: 'WAPDA emergency team + 4 drones dispatched',  reason: 'Grid failure affecting medical infrastructure — priority restore', timestamp: now - 1050000 },
      ],
      metadata: { area: 'North Karachi, Sectors 11-C to 14-B', source: 'Utility API + Social Media', commanderSummary: 'High-severity grid failure affecting 5 sectors in North Karachi. 3 hospitals on backup power. WAPDA emergency restoration team dispatched.' },
      createdAt: new Date(now - 1200000),
      updatedAt: new Date(now - 400000),
    },
  ];

  for (const doc of docs) {
    await Incident.findOneAndUpdate(
      { incidentId: doc.incidentId },
      doc,
      { upsert: true, new: true, timestamps: false }
    );
    // Register allocated resources with the resource manager
    if (doc.allocatedResources) {
      resourceManager.allocate({
        incidentId:    doc.incidentId,
        incidentType:  doc.type,
        severity:      doc.severity as any,
        confidence:    doc.confidence,
        location:      doc.location,
        requestedResources: doc.allocatedResources as any,
      });
    }
  }

  console.log(`[Seed] Inserted ${docs.length} demo incidents into MongoDB`);
  // Broadcast to any connected clients
  setTimeout(() => {
    docs.forEach(inc => eventBus.emit('incident:created', { incident: inc }));
    eventBus.emit('resources:updated', resourceManager.getStatus());
  }, 500);
}
