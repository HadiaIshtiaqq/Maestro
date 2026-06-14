import { Incident } from '../models/index';
import { resourceManager } from '../services/resourceManager';
import { eventBus } from '../events/eventBus';

// Enterprise incident demo data — security, outage, data-integrity, DDoS,
// compliance. Locations map to cloud regions so the map shows something useful.
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
      type: 'Security Breach',
      subType: 'Credential Stuffing',
      severity: 'critical',
      sevLevel: 'SEV-1',
      status: 'active',
      location: { lat: 39.0438, lng: -77.4874 }, // us-east-1 (N. Virginia)
      radius: 0,
      confidence: 0.94,
      blastRadius: 'customer-identity, session-store, auth-gateway',
      slaBreachRisk: 'HIGH — 18 min to SLA breach',
      confidenceBreakdown: {
        socialMedia:   { score: 0.0, weight: 0, factors: [], verdict: 'n/a' },
        weather:       { score: 0.0, weight: 0, factors: [], verdict: 'n/a' },
        mapsTraffic:   { score: 0.0, weight: 0, factors: [], verdict: 'n/a' },
        weightedScore: 0.94,
        displayLevel:  'CRITICAL',
      },
      allocatedResources: { sre: 3, seceng: 3, dataeng: 0, ic: 1, compliance: 1 },
      traceLog: [
        { step: 'STEP_01', agent: 'intake-normalization',  decision: 'Normalized SIEM alert from auth-gateway',         reason: '9,800 failed logins / 5 min from 412 unique IPs', timestamp: now - 300000 },
        { step: 'STEP_02', agent: 'validation-credibility', decision: 'Confirmed — not a false positive',                 reason: 'Distributed source IPs + known breached-credential list match', timestamp: now - 240000 },
        { step: 'STEP_03', agent: 'severity-blast-radius',  decision: 'Escalated to SEV-1',                               reason: 'Production identity service; lateral movement risk to session-store', timestamp: now - 180000 },
        { step: 'STEP_04', agent: 'incident-commander',     decision: 'Proposed: IP block + forced re-auth (needs approval)', reason: 'Irreversible customer impact — human approval required', timestamp: now - 120000 },
      ],
      metadata: { signalType: 'credential_stuffing', area: 'us-east-1 · customer-identity', source: 'SIEM', commanderSummary: 'Credential-stuffing attack on production identity service. IP block + forced re-auth proposed; awaiting human approval. SecEng + SRE engaged.' },
      createdAt: new Date(now - 300000),
      updatedAt: new Date(now - 60000),
    },
    {
      incidentId: 'demo-002',
      type: 'Service Outage',
      subType: 'Payments API',
      severity: 'critical',
      sevLevel: 'SEV-1',
      status: 'active',
      location: { lat: 53.3331, lng: -6.2489 }, // eu-west-1 (Ireland)
      radius: 0,
      confidence: 0.91,
      blastRadius: 'payments-api, checkout, order-service',
      slaBreachRisk: 'BREACHED — 99.9% SLO exhausted',
      confidenceBreakdown: { socialMedia:{score:0,weight:0,factors:[],verdict:'n/a'}, weather:{score:0,weight:0,factors:[],verdict:'n/a'}, mapsTraffic:{score:0,weight:0,factors:[],verdict:'n/a'}, weightedScore: 0.91, displayLevel: 'CRITICAL' },
      allocatedResources: { sre: 4, seceng: 0, dataeng: 1, ic: 1, compliance: 0 },
      traceLog: [
        { step: 'STEP_01', agent: 'intake-normalization',  decision: 'Normalized monitoring alert',               reason: 'payments-api error rate 84%, p99 latency 30s', timestamp: now - 500000 },
        { step: 'STEP_02', agent: 'correlation-dedup',     decision: 'Correlated to recent deploy v2.14.0',       reason: 'Error spike began 90s after canary rollout', timestamp: now - 450000 },
        { step: 'STEP_03', agent: 'severity-blast-radius', decision: 'SEV-1 — checkout fully down',               reason: 'Revenue-impacting; SLO already exhausted', timestamp: now - 400000 },
        { step: 'STEP_04', agent: 'incident-commander',    decision: 'Auto-approved rollback (reversible)',        reason: 'Reversible action under SEV-1 rollback policy', timestamp: now - 350000 },
      ],
      metadata: { signalType: 'service_outage', area: 'eu-west-1 · payments-api', source: 'Monitoring', commanderSummary: 'Payments API outage after v2.14.0 canary. Rollback executed. 4 SREs on bridge; checkout recovering.' },
      createdAt: new Date(now - 500000),
      updatedAt: new Date(now - 100000),
    },
    {
      incidentId: 'demo-003',
      type: 'Data Integrity',
      subType: 'Replication Failure',
      severity: 'high',
      sevLevel: 'SEV-2',
      status: 'active',
      location: { lat: 45.5235, lng: -122.6762 }, // us-west-2 (Oregon)
      radius: 0,
      confidence: 0.86,
      blastRadius: 'orders-db-primary, analytics-pipeline',
      slaBreachRisk: 'MEDIUM — RPO at risk',
      confidenceBreakdown: { socialMedia:{score:0,weight:0,factors:[],verdict:'n/a'}, weather:{score:0,weight:0,factors:[],verdict:'n/a'}, mapsTraffic:{score:0,weight:0,factors:[],verdict:'n/a'}, weightedScore: 0.86, displayLevel: 'HIGH' },
      allocatedResources: { sre: 1, seceng: 1, dataeng: 2, ic: 1, compliance: 1 },
      traceLog: [
        { step: 'STEP_01', agent: 'intake-normalization',  decision: 'Normalized DB replication alert',     reason: 'orders-db replica lag 1900s past failover threshold', timestamp: now - 700000 },
        { step: 'STEP_02', agent: 'dependency-impact-sim', decision: 'Mapped cascade to analytics-pipeline', reason: 'Stale reads risk corrupting downstream aggregates', timestamp: now - 650000 },
        { step: 'STEP_03', agent: 'severity-blast-radius', decision: 'SEV-2 — split-brain risk',             reason: 'Manual failover requires human sign-off (data loss risk)', timestamp: now - 600000 },
        { step: 'STEP_04', agent: 'incident-commander',    decision: 'Approval requested for failover',       reason: 'Potential data loss — human approval required', timestamp: now - 550000 },
      ],
      metadata: { signalType: 'db_replication_failure', area: 'us-west-2 · orders-db', source: 'Monitoring', commanderSummary: 'Orders DB replication lag past failover threshold. Data-eng team assessing; failover pending human approval.' },
      createdAt: new Date(now - 700000),
      updatedAt: new Date(now - 200000),
    },
    {
      incidentId: 'demo-004',
      type: 'Performance Degradation',
      subType: 'API Latency',
      severity: 'medium',
      sevLevel: 'SEV-3',
      status: 'analyzing',
      location: { lat: 1.3521, lng: 103.8198 }, // ap-southeast-1 (Singapore)
      radius: 0,
      confidence: 0.66,
      blastRadius: 'search-api',
      slaBreachRisk: 'LOW',
      allocatedResources: { sre: 2, seceng: 0, dataeng: 1, ic: 0, compliance: 0 },
      traceLog: [
        { step: 'STEP_01', agent: 'intake-normalization',  decision: 'Normalized latency alert',           reason: 'search-api p99 8.4s vs 500ms SLO', timestamp: now - 900000 },
        { step: 'STEP_02', agent: 'correlation-dedup',     decision: 'No correlated deploy — investigating', reason: 'Possible cache-stampede; single-region', timestamp: now - 870000 },
      ],
      metadata: { signalType: 'api_latency_breach', area: 'ap-southeast-1 · search-api', source: 'Monitoring' },
      createdAt: new Date(now - 900000),
      updatedAt: new Date(now - 800000),
    },
    {
      incidentId: 'demo-005',
      type: 'DDoS Attack',
      subType: 'Volumetric',
      severity: 'high',
      sevLevel: 'SEV-2',
      status: 'active',
      location: { lat: 50.1109, lng: 8.6821 }, // eu-central-1 (Frankfurt)
      radius: 0,
      confidence: 0.79,
      blastRadius: 'edge, storefront, cdn-origin',
      slaBreachRisk: 'HIGH — edge saturation',
      confidenceBreakdown: { socialMedia:{score:0,weight:0,factors:[],verdict:'n/a'}, weather:{score:0,weight:0,factors:[],verdict:'n/a'}, mapsTraffic:{score:0,weight:0,factors:[],verdict:'n/a'}, weightedScore: 0.79, displayLevel: 'HIGH' },
      allocatedResources: { sre: 2, seceng: 2, dataeng: 0, ic: 1, compliance: 0 },
      traceLog: [
        { step: 'STEP_01', agent: 'intake-normalization',  decision: 'Normalized edge traffic alert',          reason: '14× baseline RPS; 61% from one ASN', timestamp: now - 1200000 },
        { step: 'STEP_02', agent: 'validation-credibility', decision: 'Confirmed volumetric DDoS',              reason: 'Traffic concentration + malformed request signature', timestamp: now - 1150000 },
        { step: 'STEP_03', agent: 'severity-blast-radius',  decision: 'SEV-2 — storefront degraded',            reason: 'Edge saturation; legitimate users seeing 503s', timestamp: now - 1100000 },
        { step: 'STEP_04', agent: 'incident-commander',     decision: 'Auto-approved WAF rate-limit (reversible)', reason: 'Reversible mitigation — scrubbing enabled', timestamp: now - 1050000 },
      ],
      metadata: { signalType: 'ddos_suspected', area: 'eu-central-1 · edge', source: 'SIEM', commanderSummary: 'Volumetric DDoS on edge from single ASN. WAF rate-limiting + scrubbing enabled. SecEng + SRE on bridge.' },
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
    if (doc.allocatedResources) {
      resourceManager.allocate({
        incidentId:    doc.incidentId,
        incidentType:  doc.type,
        severity:      doc.severity as any,
        confidence:    doc.confidence,
        requestedResources: doc.allocatedResources as any,
      });
    }
  }

  console.log(`[Seed] Inserted ${docs.length} enterprise demo incidents into MongoDB`);
  setTimeout(() => {
    docs.forEach(inc => eventBus.emit('incident:created', { incident: inc }));
    eventBus.emit('resources:updated', resourceManager.getStatus());
  }, 500);
}
