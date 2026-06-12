/**
 * NEXUS Demo Runner
 * Fires the three canonical demo scenarios for the Band of Agents Hackathon.
 *
 * Usage:
 *   npx tsx scenarios/demo_runner.ts [scenario]
 *   scenarios: single | false-positive | concurrent | all (default)
 *
 * The server must be running on PORT (default 3000) before invoking.
 */

const BASE_URL = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

async function post(path: string, body: any) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function get(path: string) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Poll /api/incidents until at least one incident has left the transient states
 * ('analyzing' | 'detected') or the timeout expires. Replaces blind sleep() calls
 * so the runner adapts to variable Gemini/Claude API latency.
 */
async function pollUntilSettled(
  minCount    = 1,
  maxWaitMs   = 60_000,
  intervalMs  = 1_500
): Promise<any[]> {
  const deadline = Date.now() + maxWaitMs;
  process.stdout.write('   ');
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    process.stdout.write('.');
    try {
      const { incidents } = await get('/api/incidents');
      const settled = (incidents ?? []).filter(
        (i: any) => !['analyzing', 'detected'].includes(i.status)
      );
      if (settled.length >= minCount) {
        process.stdout.write('\n');
        return incidents ?? [];
      }
    } catch { /* server may still be processing */ }
  }
  process.stdout.write('\n');
  const { incidents } = await get('/api/incidents').catch(() => ({ incidents: [] }));
  return incidents ?? [];
}

/**
 * Poll /api/active-crises until at least minCount incidents have settled,
 * returning the full { incidents, resourceMap } payload.
 */
async function pollActiveCrisesSettled(
  minCount   = 2,
  maxWaitMs  = 90_000,
  intervalMs = 1_500
): Promise<{ incidents: any[]; resourceMap: any }> {
  const deadline = Date.now() + maxWaitMs;
  process.stdout.write('   ');
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    process.stdout.write('.');
    try {
      const data = await get('/api/active-crises');
      const settled = (data.incidents ?? []).filter(
        (i: any) => !['analyzing', 'detected'].includes(i.status)
      );
      if (settled.length >= minCount) {
        process.stdout.write('\n');
        return data;
      }
    } catch { /* ignore */ }
  }
  process.stdout.write('\n');
  return get('/api/active-crises').catch(() => ({ incidents: [], resourceMap: {} }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 — Single Major Incident (Happy Path)
// TRD §5: credential-stuffing, SEV-2, ~12k customers, human approval
// ─────────────────────────────────────────────────────────────────────────────

async function scenario1_singleIncident() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' SCENARIO 1 — Single Major Incident (Happy Path)');
  console.log(' Credential-stuffing attack on Auth Service, SEV-2');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('[1/3] Injecting monitoring spike (Auth Service — login error rate +340%)…');
  const s1 = await post('/api/ingest-signal', {
    source:  'monitoring',
    type:    'error_rate_spike',
    data: {
      service:     'auth-service',
      region:      'us-east-1',
      metric:      'login_error_rate',
      value:       340,
      threshold:   50,
      description: 'Login error rate spike +340% on auth-service us-east-1. Possible credential stuffing.',
    },
    urgency:   8,
    timestamp: new Date().toISOString(),
  });
  console.log(`   ✓ Signal ingested: ${s1.signal?._id ?? 'ok'}`);

  console.log('[2/3] Injecting SIEM alert (unusual auth pattern — distributed IPs)…');
  const s2 = await post('/api/ingest-signal', {
    source:  'siem',
    type:    'auth_anomaly',
    data: {
      service:     'auth-service',
      region:      'us-east-1',
      pattern:     'distributed_login_attempts',
      source_ips:  1843,
      attempts:    92000,
      description: 'SIEM: 92,000 login attempts from 1,843 distinct IPs in 15 min. Credential stuffing signature.',
    },
    urgency:   9,
    timestamp: new Date().toISOString(),
  });
  console.log(`   ✓ Signal ingested: ${s2.signal?._id ?? 'ok'}`);

  console.log('[3/3] Injecting support ticket surge (customers reporting login failures)…');
  const s3 = await post('/api/ingest-signal', {
    source:  'ticket',
    type:    'login_failure_surge',
    data: {
      service:      'auth-service',
      ticket_count: 847,
      rate:         '847 tickets in 20 min',
      description:  'Support: 847 tickets in 20 minutes — customers cannot log in. Widespread authentication failure.',
    },
    urgency:   7,
    timestamp: new Date().toISOString(),
  });
  console.log(`   ✓ Signal ingested: ${s3.signal?._id ?? 'ok'}`);

  console.log('\n⏳ Polling until agent pipeline settles (adapts to API latency)…');
  const incidents = await pollUntilSettled(1);
  const latest = incidents[0];
  if (!latest) { console.log('   ⚠ No incident created — check server logs'); return; }

  console.log(`\n✅ Incident created: ${latest.incidentId}`);
  console.log(`   Type:       ${latest.type}`);
  console.log(`   SEV level:  ${latest.sevLevel ?? latest.severity}`);
  console.log(`   Confidence: ${Math.round((latest.confidence ?? 0) * 100)}%`);
  console.log(`   Room:       ${latest.roomId ?? '(no room yet)'}`);

  if (latest.roomId) {
    const { messages } = await get(`/api/band/rooms/${latest.roomId}`);
    console.log(`\n   Band Room — ${messages.length} messages in audit trail:`);
    for (const m of (messages ?? []).slice(0, 10)) {
      console.log(`   [${m.msg_type.padEnd(16)}] ${m.from_agent.padEnd(26)} ${m.ts?.slice(11, 19)}`);
    }
    if (messages.length > 10) console.log(`   … and ${messages.length - 10} more`);

    const approvalReq = (messages ?? []).find((m: any) => m.msg_type === 'approval_request');
    if (approvalReq) {
      console.log('\n   ⚠ Approval gate: human commander approval required.');
      console.log(`   Proposal: ${JSON.stringify(approvalReq.payload?.recommendedAction ?? {}, null, 2)}`);
      console.log('\n   → Simulating Human Commander approval in 2s…');
      await sleep(2000);
      await post('/api/band/approve', {
        proposalMsgId: approvalReq.id,
        approverId:    'maya-incident-commander',
        notes:         'Confirmed credential stuffing. Approve IP block + forced re-auth.',
      });
      console.log('   ✓ Approved! Comms agent triggered. Audit trail updated.');
    }
  }

  if (latest.metadata?.commanderSummary) {
    console.log(`\n   Commander Summary:\n   "${latest.metadata.commanderSummary}"`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 — False-Positive Suppression
// TRD §7 W2: conflicting signals → Validation resolves → retraction
// ─────────────────────────────────────────────────────────────────────────────

async function scenario2_falsePositive() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' SCENARIO 2 — False-Positive Suppression');
  console.log(' Conflicting signals → Validation resolves → retraction');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('[1/2] Injecting low-confidence social signal (unverified tweet about outage)…');
  const s1 = await post('/api/ingest-signal', {
    source:  'human',
    type:    'social_report',
    data: {
      service:     'payment-service',
      region:      'eu-west-1',
      description: 'Unverified report: user @acme_ops tweets "payment service down". No monitoring confirmation.',
    },
    urgency:   3,
    timestamp: new Date().toISOString(),
  });
  console.log(`   ✓ Signal: ${s1.signal?._id ?? 'ok'}`);

  console.log('[2/2] Injecting conflicting monitoring data (all metrics nominal)…');
  const s2 = await post('/api/ingest-signal', {
    source:  'monitoring',
    type:    'metrics_nominal',
    data: {
      service:     'payment-service',
      region:      'eu-west-1',
      description: 'APM confirms payment-service nominal: error rate 0.1%, p99 latency 45ms, all health checks green.',
    },
    urgency:   1,
    timestamp: new Date().toISOString(),
  });
  console.log(`   ✓ Signal: ${s2.signal?._id ?? 'ok'}`);

  console.log('\n⏳ Polling until Validation agent resolves conflict…');
  const incidents = await pollUntilSettled(1);
  const latest = incidents[0];
  if (!latest) {
    console.log('   ✓ Pipeline correctly suppressed false positive — no incident created');
    return;
  }

  if (latest.status === 'retracted' || (latest.confidence ?? 0) < 0.5) {
    console.log(`\n✅ FALSE POSITIVE SUPPRESSED`);
    console.log(`   Incident: ${latest.incidentId} → status: ${latest.status}`);
    console.log(`   Confidence: ${Math.round((latest.confidence ?? 0) * 100)}% (below 50% threshold)`);

    if (latest.roomId) {
      const { messages } = await get(`/api/band/rooms/${latest.roomId}`);
      const retraction = (messages ?? []).find((m: any) => m.msg_type === 'retraction');
      if (retraction) {
        console.log(`\n   Retraction in Band room: ${retraction.payload?.reason}`);
        console.log(`   Resources released. Audit trail complete.`);
      }
    }

    console.log('\n   → Field verification (operator marks as false alarm)…');
    await sleep(500);
    await post('/api/incidents/verify', {
      incidentId: latest.incidentId,
      status:     'false_alarm',
      fieldReport: { source: 'field-officer', notes: 'Checked on-site: payment service fully operational.' },
    });
    console.log('   ✓ False alarm confirmed and logged in audit trail.');
  } else {
    console.log(`\n   Incident created (confidence ${Math.round((latest.confidence ?? 0) * 100)}%) — retract manually if needed.`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 — Concurrent Incidents Under Scarcity
// TRD §6: two rooms, shared SRE pool, Allocation arbitrates
// ─────────────────────────────────────────────────────────────────────────────

async function scenario3_concurrent() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' SCENARIO 3 — Concurrent Incidents Under Scarcity');
  console.log(' Two incidents compete for the same SRE team');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('[PARALLEL] Firing two incidents simultaneously…');

  const [r1, r2] = await Promise.all([
    post('/api/ingest-signal', {
      source:  'monitoring',
      type:    'database_latency_spike',
      data: {
        service:     'orders-service',
        region:      'us-west-2',
        metric:      'db_query_p99',
        value:       4200,
        threshold:   200,
        description: 'Orders service DB latency P99 = 4.2s (threshold 200ms). 20k orders/min affected.',
      },
      urgency:   8,
      timestamp: new Date().toISOString(),
    }),
    post('/api/ingest-signal', {
      source:  'siem',
      type:    'privilege_escalation',
      data: {
        service:     'admin-console',
        region:      'us-east-1',
        description: 'SIEM: Privilege escalation detected in admin-console. Service account granted admin role without change ticket.',
      },
      urgency:   9,
      timestamp: new Date().toISOString(),
    }),
  ]);

  console.log(`   ✓ Signal 1 (DB latency):     ${r1.signal?._id ?? 'ok'}`);
  console.log(`   ✓ Signal 2 (Privilege esc.): ${r2.signal?._id ?? 'ok'}`);

  console.log('\n⏳ Polling until both pipelines and allocation arbitration settle…');
  const { incidents, resourceMap } = await pollActiveCrisesSettled(2);
  const recent = incidents.slice(0, 2);

  console.log(`\n✅ ${incidents.length} active incident(s) after concurrent signals`);
  for (const inc of recent) {
    console.log(`\n   Incident: ${inc.incidentId}`);
    console.log(`   Type:     ${inc.type}`);
    console.log(`   SEV:      ${inc.sevLevel ?? inc.severity}`);
    console.log(`   Room:     ${inc.roomId ?? '(pending)'}`);
    if (inc.metadata?.commanderSummary) {
      console.log(`   Summary:  ${inc.metadata.commanderSummary.slice(0, 120)}…`);
    }
    if (inc.responderAssignments?.length) {
      console.log(`   Responders assigned:`);
      for (const a of inc.responderAssignments) {
        console.log(`     - ${a.role} × ${a.count} (${a.oncallTeam})`);
      }
    }
  }

  console.log('\n   Resource Pool Status:');
  console.log(`   ${JSON.stringify(resourceMap?.available ?? {}, null, 2)}`);

  const contention = recent.find((i: any) =>
    i.metadata?.commanderSummary?.toLowerCase().includes('contention') ||
    i.metadata?.commanderSummary?.toLowerCase().includes('compet')
  );
  if (contention) {
    console.log('\n   ⚠ Resource contention detected and arbitrated by Allocation agent.');
    console.log('   Reasoning is logged in the Band room audit trail for both incidents.');
  }

  console.log('\n   ✅ Concurrent scenario complete — two separate Band rooms, one shared pool arbitration.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const scenario = process.argv[2] ?? 'all';
  console.log(`\n🚀 NEXUS Demo Runner — targeting ${BASE_URL}`);
  console.log(`   Scenario: ${scenario}\n`);

  try {
    const health = await get('/api/health');
    console.log(`   Server health: ${health.status} | MongoDB: ${health.mongo}`);
  } catch (e: any) {
    console.error(`\n❌ Server not reachable at ${BASE_URL}. Start it with: npm run dev`);
    process.exit(1);
  }

  if (scenario === 'single'         || scenario === 'all') await scenario1_singleIncident();
  if (scenario === 'false-positive' || scenario === 'all') await scenario2_falsePositive();
  if (scenario === 'concurrent'     || scenario === 'all') await scenario3_concurrent();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' Demo complete. Open the operator view to see rooms.');
  console.log(`  Operator: ${BASE_URL}`);
  console.log(`  Audit:    ${BASE_URL}/api/band/audit-trail/<incidentId>`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error(e); process.exit(1); });
