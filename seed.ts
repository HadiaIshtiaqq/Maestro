/**
 * NEXUS seed script — populates MongoDB with realistic mock signals covering:
 *   • Multi-source fusion demo (social + weather + traffic for same flood)
 *   • Conflict resolution demo (social says flood; sensor says dry → field_verification)
 *   • Heatwave cluster for stress-test scenario
 *
 * Usage: npx tsx seed.ts
 */

import mongoose from 'mongoose';
import { Signal, Incident } from './src/models/index';
import { config } from './src/config/index';

async function seed() {
  await mongoose.connect(config.mongodb.uri);
  console.log('[Seed] Connected to MongoDB…');

  await Signal.deleteMany({});
  await Incident.deleteMany({});
  console.log('[Seed] Cleared existing signals and incidents.');

  // ── Cluster 1: Urban Flood — Sector A (consistent signals, high confidence) ──

  const floodSignals = [
    {
      source:    'social',
      type:      'flood_report',
      data:      {
        text:     'MAJOR flooding at Main & Harbor intersection! Cars are underwater. HELP!',
        user:     '@karachi_live',
        mentions: 1240,
        platform: 'Twitter',
        verified: false,
      },
      location:  { lat: 24.8607, lng: 67.0011 },
      urgency:   9,
      timestamp: new Date(Date.now() - 18 * 60_000), // 18 min ago
    },
    {
      source:    'social',
      type:      'flood_report',
      data:      {
        text:     'I.I. Chundrigar completely flooded. Buses stranded. Storm drains overflowing.',
        user:     '@urban_watcher',
        mentions: 563,
        platform: 'Twitter',
        verified: false,
      },
      location:  { lat: 24.8615, lng: 67.0005 },
      urgency:   8,
      timestamp: new Date(Date.now() - 15 * 60_000),
    },
    {
      source:    'weather',
      type:      'rainfall_alert',
      data:      {
        rainfall_mm:    78,
        duration_hrs:   1.5,
        drain_capacity: 'overwhelmed',
        forecast:       'Continuing heavy rainfall for next 3 hours',
        station:        'Karachi Met Station 3',
      },
      location:  { lat: 24.8600, lng: 67.0100 },
      urgency:   8,
      timestamp: new Date(Date.now() - 20 * 60_000),
    },
    {
      source:    'traffic',
      type:      'road_closure',
      data:      {
        congestion_level:  'gridlock',
        affected_roads:    ['Main Blvd', 'Harbor Rd', 'I.I. Chundrigar Rd', 'Shahrah-e-Faisal'],
        incident_type:     'flooding',
        vehicles_stranded: 47,
      },
      location:  { lat: 24.8620, lng: 66.9980 },
      urgency:   7,
      timestamp: new Date(Date.now() - 12 * 60_000),
    },
    {
      source:    'call',
      type:      'emergency_call',
      data:      {
        caller:  '1122',
        message: 'Multiple calls reporting flooding near Lighthouse area. 3 people trapped in vehicle.',
        count:   12,
      },
      location:  { lat: 24.8590, lng: 67.0020 },
      urgency:   10,
      timestamp: new Date(Date.now() - 10 * 60_000),
    },
  ];

  // ── Cluster 2: CONFLICT DEMO — Social says flood; sensor says dry ──────────
  // This triggers the credibility agent's SENSOR_SOCIAL_MISMATCH flag
  // and sets status to POTENTIAL_CRISIS + requiresFieldVerification = true

  const conflictSignals = [
    {
      source:    'social',
      type:      'flood_report',
      data:      {
        text:     'Flooding reported near Port Qasim industrial zone! Roads closed!',
        user:     '@portwatch_pk',
        mentions: 89,
        platform: 'Facebook',
        verified: false,
      },
      location:  { lat: 24.7960, lng: 67.3200 },
      urgency:   6,
      credibilityScore: 0.42,
      conflictFlags: [{
        type:                'SENSOR_SOCIAL_MISMATCH',
        description:         'Social media reports flooding at Port Qasim but weather sensor shows only 4mm rainfall — well within drain capacity',
        suggestedResolution: 'field_verification',
      }],
      timestamp: new Date(Date.now() - 25 * 60_000),
    },
    {
      source:    'sensor',
      type:      'rainfall_reading',
      data:      {
        rainfall_mm:    4,
        drain_status:   'normal',
        flood_risk:     'low',
        station:        'Port Qasim Weather Station',
        temperature_c:  39,
      },
      location:  { lat: 24.7970, lng: 67.3190 },
      urgency:   2,
      credibilityScore: 0.95,
      timestamp: new Date(Date.now() - 22 * 60_000),
    },
  ];

  // ── Cluster 3: Heatwave — Sector B (for stress-test, concurrent with flood) ─

  const heatwaveSignals = [
    {
      source:    'sensor',
      type:      'heatwave_alert',
      data:      {
        temperature_c:  47,
        humidity_pct:   12,
        heat_index:     'EXTREME DANGER',
        zone:           'Sector B — North Karachi Residential',
        cooling_centers: 'At capacity',
      },
      location:  { lat: 24.9056, lng: 67.0822 },
      urgency:   9,
      timestamp: new Date(Date.now() - 8 * 60_000),
    },
    {
      source:    'call',
      type:      'emergency_call',
      data:      {
        caller:  'RESCUE_1122',
        message: '14 heat-stroke victims reported across 3 buildings. Elderly residents, no cooling. Ambulance requested urgently.',
        count:   14,
      },
      location:  { lat: 24.9080, lng: 67.0800 },
      urgency:   10,
      timestamp: new Date(Date.now() - 5 * 60_000),
    },
    {
      source:    'social',
      type:      'heatwave_report',
      data:      {
        text:     'People collapsing in North residential buildings. No power, no AC, elderly dying. WHERE IS THE GOVERNMENT??',
        user:     '@northkarachi_citizen',
        mentions: 2100,
        platform: 'Twitter',
        verified: false,
      },
      location:  { lat: 24.9060, lng: 67.0840 },
      urgency:   9,
      timestamp: new Date(Date.now() - 3 * 60_000),
    },
  ];

  const allSignals = [...floodSignals, ...conflictSignals, ...heatwaveSignals];
  const inserted = await Signal.insertMany(allSignals);
  console.log(`[Seed] Inserted ${inserted.length} signals across 3 clusters.`);
  console.log('         Cluster 1 — Urban Flood (Sector A):           5 signals');
  console.log('         Cluster 2 — Conflict Demo (Port Qasim):       2 signals (SENSOR_SOCIAL_MISMATCH)');
  console.log('         Cluster 3 — Heatwave (Sector B):              3 signals');
  console.log('\n[Seed] Done. Run `npm run dev` then POST /api/ingest-signal to trigger the pipeline.');

  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('[Seed] Error:', err);
  mongoose.disconnect();
});
