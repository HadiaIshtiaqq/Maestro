import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, SafeAreaView, Linking } from 'react-native';
import MapView, { Marker, Circle, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Incident } from '../services/api';
import { authApi, getToken } from '../services/auth';
import { BASE_URL } from '../services/api';
import { COLORS, STATUS_COLOR } from '../theme';

const TRACE_STAGES = [
  { key: 'INGESTION',   icon: '📥', color: '#00F0FF', agents: ['language', 'signal'] },
  { key: 'ANALYSIS',    icon: '🔍', color: '#7C3AED', agents: ['credibility', 'classification'] },
  { key: 'PREDICTION',  icon: '📊', color: '#FF8A00', agents: ['severity', 'prediction'] },
  { key: 'ACTION',      icon: '⚡', color: '#00E676', agents: ['resource', 'traffic', 'notification', 'infrastructure'] },
  { key: 'COMMAND',     icon: '🎖️', color: '#FFD600', agents: ['commander', 'incident-commander'] },
  { key: 'VERIFICATION',icon: '✅', color: '#FF3B5C', agents: ['recovery', 'escalation', 'verification'] },
];

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4a5568' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1c2230' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1628' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
];

export default function IncidentDetailScreen({ route, navigation }: any) {
  const incident: Incident = route.params.incident;
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'mitigation' | 'trace' | 'messages'>('overview');

  const color   = STATUS_COLOR[incident.severity] ?? COLORS.muted;
  const conf    = Math.round((incident.confidence ?? 0) * 100);
  const infra   = incident.infrastructureRecommendations;

  const dispatch = async (service: 'ambulance' | 'police' | 'fire') => {
    Alert.alert(
      `Dispatch ${service}?`,
      `Send an automated alert to the ${service} service for this incident?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dispatch', style: 'destructive',
          onPress: async () => {
            setDispatching(service);
            try {
              const token = await getToken();
              await fetch(`${BASE_URL}/api/users/dispatch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({
                  service, phone: '', // In production, pull from a known dispatch registry
                  incidentId: incident.incidentId,
                  incidentType: incident.type,
                  location: incident.location,
                  severity: incident.severity,
                  unitsNeeded: incident.allocatedResources?.[service] ?? 1,
                }),
              });
              Alert.alert('Dispatched', `${service.toUpperCase()} has been alerted.`);
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setDispatching(null);
            }
          },
        },
      ],
    );
  };

  const openMaps = (lat: number, lng: number, label?: string) => {
    const url = `https://maps.google.com/?q=${lat},${lng}${label ? `&label=${encodeURIComponent(label)}` : ''}`;
    Linking.openURL(url);
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: color + '40' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{incident.type}</Text>
          <Text style={[styles.headerSev, { color }]}>{incident.severity?.toUpperCase()} · {conf}% CONFIDENCE</Text>
        </View>
        <View style={[styles.statusBadge, { borderColor: color }]}>
          <Text style={[styles.statusText, { color }]}>{incident.status}</Text>
        </View>
      </View>

      {/* Mini map */}
      <View style={styles.mapWrap}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          customMapStyle={DARK_MAP_STYLE}
          initialRegion={{ latitude: incident.location.lat, longitude: incident.location.lng, latitudeDelta: 0.06, longitudeDelta: 0.07 }}
          scrollEnabled={false}
          zoomEnabled={false}
        >
          <Circle center={{ latitude: incident.location.lat, longitude: incident.location.lng }} radius={incident.radius ?? 1000} fillColor={color + '20'} strokeColor={color + '80'} strokeWidth={2} />
          <Marker coordinate={{ latitude: incident.location.lat, longitude: incident.location.lng }}>
            <View style={[styles.markerDot, { backgroundColor: color }]}><Text style={{ fontSize: 18 }}>🚨</Text></View>
          </Marker>
          {infra?.nearbyHospitals?.map((h: any) => (
            <Marker key={h.id} coordinate={{ latitude: h.lat, longitude: h.lng }} title={h.name}>
              <Text style={{ fontSize: 20 }}>🏥</Text>
            </Marker>
          ))}
          {infra?.alternativeRoutes?.map((r: any) =>
            r.waypoints?.length >= 2 ? (
              <Polyline key={r.id} coordinates={r.waypoints.map((w: any) => ({ latitude: w.lat, longitude: w.lng }))}
                strokeColor={r.status === 'clear' ? COLORS.success : COLORS.caution} strokeWidth={3} />
            ) : null
          )}
        </MapView>
        <TouchableOpacity style={styles.mapLink} onPress={() => openMaps(incident.location.lat, incident.location.lng, incident.type)}>
          <Text style={styles.mapLinkText}>Open in Google Maps ↗</Text>
        </TouchableOpacity>
      </View>

      {/* Commander Summary */}
      {incident.metadata?.commanderSummary && (
        <View style={styles.commanderCard}>
          <View style={styles.commanderHeader}>
            <Text style={styles.commanderIcon}>🎖️</Text>
            <Text style={styles.commanderLabel}>COMMANDER SUMMARY</Text>
          </View>
          <Text style={styles.commanderText}>"{incident.metadata.commanderSummary}"</Text>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['overview', 'mitigation', 'trace', 'messages'] as const).map(t => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t as any)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'overview' ? '📊' : t === 'mitigation' ? '🏥' : t === 'trace' ? '🤖' : '📢'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {tab === 'overview' && (
          <>
            {/* Confidence breakdown */}
            {incident.confidenceBreakdown && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>3-SOURCE VERIFICATION</Text>
                {(['socialMedia', 'weather', 'mapsTraffic'] as const).map(src => {
                  const s = (incident.confidenceBreakdown as any)?.[src];
                  if (!s) return null;
                  const pct = Math.round((s.score ?? 0) * 100);
                  return (
                    <View key={src} style={styles.confRow}>
                      <Text style={styles.confSrc}>{src === 'socialMedia' ? '📱 Social' : src === 'weather' ? '🌩 Weather' : '🗺 Maps'}</Text>
                      <View style={styles.confBar}><View style={[styles.confFill, { width: `${pct}%` as any }]} /></View>
                      <Text style={styles.confPct}>{pct}%</Text>
                      <Text style={styles.confVerdict}>{s.verdict}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Resources */}
            {incident.allocatedResources && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>ALLOCATED RESOURCES</Text>
                <View style={styles.resourceGrid}>
                  {Object.entries(incident.allocatedResources).map(([k, v]) => (
                    <View key={k} style={styles.resourceItem}>
                      <Text style={styles.resEmoji}>{k === 'ambulance' ? '🚑' : k === 'police' ? '🚔' : k === 'fire' ? '🚒' : '🛸'}</Text>
                      <Text style={styles.resCount}>{v as number}</Text>
                      <Text style={styles.resLabel}>{k}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Dispatch buttons */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>DISPATCH SERVICES</Text>
              <View style={styles.dispatchRow}>
                {(['ambulance', 'police', 'fire'] as const).map(s => (
                  <TouchableOpacity key={s} style={styles.dispatchBtn} onPress={() => dispatch(s)} disabled={dispatching === s}>
                    {dispatching === s ? <ActivityIndicator color={COLORS.primary} size="small" /> : (
                      <><Text style={{ fontSize: 20 }}>{s === 'ambulance' ? '🚑' : s === 'police' ? '🚔' : '🚒'}</Text>
                      <Text style={styles.dispatchLabel}>{s}</Text></>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.dispatchNote}>Sends automated SMS alert to the respective service</Text>
            </View>
          </>
        )}

        {tab === 'mitigation' && (
          <>
            {/* Hospitals */}
            {infra?.nearbyHospitals?.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>🏥 NEARBY HOSPITALS</Text>
                {infra.nearbyHospitals.map((h: any) => (
                  <TouchableOpacity key={h.id} style={styles.infraItem} onPress={() => openMaps(h.lat, h.lng, h.name)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infraName}>{h.name}</Text>
                      <Text style={styles.infraSub}>{h.distanceKm}km · {h.bedsAvailable} beds{h.hasTraumaUnit ? ' · Trauma' : ''}{h.hasCooling ? ' · Cooling' : ''}</Text>
                    </View>
                    <Text style={styles.mapsArrow}>↗</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Water / Aero facilities */}
            {infra?.waterFacilities?.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>💧 WATER & AERO FACILITIES</Text>
                {infra.waterFacilities.map((w: any) => (
                  <TouchableOpacity key={w.id} style={styles.infraItem} onPress={() => openMaps(w.lat, w.lng, w.name)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infraName}>{w.name}</Text>
                      <Text style={styles.infraSub}>{w.type} · {w.status}</Text>
                    </View>
                    <Text style={styles.mapsArrow}>↗</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Alternative routes */}
            {infra?.alternativeRoutes?.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>🛣 ALTERNATIVE ROUTES</Text>
                {infra.alternativeRoutes.map((r: any) => (
                  <View key={r.id} style={styles.routeItem}>
                    <View style={[styles.routeDot, { backgroundColor: r.status === 'clear' ? COLORS.success : r.status === 'closed' ? COLORS.error : COLORS.caution }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infraName}>{r.name}</Text>
                      <Text style={styles.infraSub}>{r.status?.toUpperCase()}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Emergency contacts */}
            {infra?.emergencyContacts?.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>📞 EMERGENCY CONTACTS</Text>
                {infra.emergencyContacts.map((c: any, i: number) => (
                  <TouchableOpacity key={i} style={styles.infraItem} onPress={() => Linking.openURL(`tel:${c.number}`)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infraName}>{c.agency}</Text>
                      <Text style={styles.infraSub}>{c.type}</Text>
                    </View>
                    <Text style={styles.callBtn}>{c.number} 📞</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        {tab === 'trace' && (
          <>
            {TRACE_STAGES.map(stage => {
              const steps = (incident.traceLog ?? []).filter((s: any) =>
                stage.agents.some(a => s.agent?.toLowerCase().includes(a))
              );
              if (steps.length === 0) return null;
              return (
                <View key={stage.key} style={styles.stageBlock}>
                  <View style={[styles.stageHeader, { borderLeftColor: stage.color }]}>
                    <Text style={styles.stageIcon}>{stage.icon}</Text>
                    <Text style={[styles.stageLabel, { color: stage.color }]}>{stage.key}</Text>
                  </View>
                  {steps.map((step: any, i: number) => (
                    <View key={i} style={[styles.traceStep, { borderLeftColor: stage.color + '40' }]}>
                      <View style={styles.traceStepInner}>
                        <View style={styles.traceAgentRow}>
                          <View style={[styles.agentBadge, { backgroundColor: stage.color + '20', borderColor: stage.color + '50' }]}>
                            <Text style={[styles.traceAgent, { color: stage.color }]}>{step.agent?.toUpperCase()}</Text>
                          </View>
                          {step.confidence != null && (
                            <View style={[styles.confBadge, { backgroundColor: step.confidence >= 0.75 ? COLORS.success + '20' : COLORS.warning + '20' }]}>
                              <Text style={[styles.confBadgeText, { color: step.confidence >= 0.75 ? COLORS.success : COLORS.warning }]}>{Math.round(step.confidence * 100)}%</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.traceDecision}>{step.decision}</Text>
                        {step.reason && <Text style={styles.traceReason}>{step.reason}</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}
            {/* Simple list fallback if no stage matches */}
            {TRACE_STAGES.every(stage =>
              (incident.traceLog ?? []).filter((s: any) =>
                stage.agents.some(a => s.agent?.toLowerCase().includes(a))
              ).length === 0
            ) && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>🤖 AI AGENT PIPELINE</Text>
                {(incident.traceLog ?? []).map((step: any, i: number) => (
                  <View key={i} style={styles.traceStep}>
                    <View style={styles.traceDotWrap}>
                      <View style={[styles.traceDot, { backgroundColor: COLORS.primary }]} />
                      {i < (incident.traceLog ?? []).length - 1 && <View style={styles.traceLine} />}
                    </View>
                    <View style={styles.traceContent}>
                      <Text style={styles.traceAgent}>{step.agent}</Text>
                      <Text style={styles.traceDecision} numberOfLines={3}>{step.decision}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {tab === 'messages' && (
          <>
            {[
              {
                title: '📢 PUBLIC ALERT SMS',
                color: COLORS.error,
                body: `NEXUS ALERT: ${incident.type?.toUpperCase()} reported in ${incident.metadata?.area ?? 'your area'}. ${incident.severity === 'critical' ? 'EVACUATE IMMEDIATELY.' : 'Avoid the area.'} Emergency services en route. Stay tuned for updates. — NEXUS Crisis Platform`,
              },
              {
                title: '🏥 HOSPITAL NOTIFICATION',
                color: COLORS.warning,
                body: `INCOMING ALERT — ${incident.type} incident, ${incident.severity?.toUpperCase()} severity. Estimated ${incident.allocatedResources?.ambulance ?? 0} ambulances dispatched. Prepare trauma bay. Confidence: ${Math.round((incident.confidence ?? 0) * 100)}%. Location: ${incident.metadata?.area ?? `${incident.location.lat.toFixed(4)}, ${incident.location.lng.toFixed(4)}`}`,
              },
              {
                title: '🚔 POLICE DISPATCH ORDER',
                color: COLORS.primary,
                body: `DISPATCH ORDER — ${incident.allocatedResources?.police ?? 0} units required. Incident: ${incident.type}. Area: ${incident.metadata?.area ?? 'Karachi'}. Status: ${incident.status?.toUpperCase()}. Report to incident commander on arrival. NEXUS ID: ${incident.incidentId?.slice(0, 8).toUpperCase()}`,
              },
              {
                title: '📰 MEDIA STATEMENT',
                color: COLORS.muted,
                body: `NEXUS Crisis Platform has detected a ${incident.severity} ${incident.type?.toLowerCase()} incident in ${incident.metadata?.area ?? 'Karachi'}. Emergency response is active. Resources deployed: ${Object.entries(incident.allocatedResources ?? {}).filter(([,v]) => (v as number) > 0).map(([k,v]) => `${v} ${k}`).join(', ') || 'pending'}. Updates will follow.`,
              },
            ].map(msg => (
              <View key={msg.title} style={[styles.msgCard, { borderLeftColor: msg.color }]}>
                <Text style={[styles.msgTitle, { color: msg.color }]}>{msg.title}</Text>
                <Text style={styles.msgBody}>{msg.body}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: COLORS.bg },
  header:      { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10, borderBottomWidth: 1 },
  back:        { paddingRight: 4 },
  backText:    { color: COLORS.muted, fontWeight: '700', fontSize: 14 },
  headerTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text, textTransform: 'uppercase' },
  headerSev:   { fontSize: 10, fontWeight: '900', marginTop: 2, letterSpacing: 0.5 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  statusText:  { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  mapWrap:     { height: 180, position: 'relative' },
  map:         { flex: 1 },
  mapLink:     { position: 'absolute', bottom: 10, right: 10, backgroundColor: COLORS.surface + 'ee', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border },
  mapLinkText: { color: COLORS.primary, fontSize: 10, fontWeight: '700' },
  markerDot:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tabs:        { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab:         { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:   { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText:     { fontSize: 10, fontWeight: '800', color: COLORS.muted, textTransform: 'uppercase' },
  tabTextActive: { color: COLORS.primary },
  body:        { flex: 1 },
  card:        { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14, gap: 12 },
  cardLabel:   { fontSize: 9, fontWeight: '900', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5 },
  confRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confSrc:     { fontSize: 10, fontWeight: '700', color: COLORS.muted, width: 70 },
  confBar:     { flex: 1, height: 4, backgroundColor: COLORS.border, borderRadius: 99, overflow: 'hidden' },
  confFill:    { height: 4, backgroundColor: COLORS.primary, borderRadius: 99 },
  confPct:     { fontSize: 10, fontWeight: '900', color: COLORS.primary, width: 28, textAlign: 'right' },
  confVerdict: { fontSize: 9, color: COLORS.muted, width: 60, textAlign: 'right' },
  resourceGrid: { flexDirection: 'row', gap: 12 },
  resourceItem: { flex: 1, backgroundColor: COLORS.bg, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: COLORS.border },
  resEmoji:    { fontSize: 24 },
  resCount:    { fontSize: 20, fontWeight: '900', color: COLORS.text },
  resLabel:    { fontSize: 9, color: COLORS.muted, fontWeight: '700', textTransform: 'uppercase' },
  dispatchRow: { flexDirection: 'row', gap: 10 },
  dispatchBtn: { flex: 1, backgroundColor: COLORS.bg, borderRadius: 14, paddingVertical: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: COLORS.border },
  dispatchLabel: { fontSize: 10, fontWeight: '800', color: COLORS.muted, textTransform: 'uppercase' },
  dispatchNote:  { fontSize: 9, color: COLORS.muted, textAlign: 'center', fontWeight: '600' },
  infraItem:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infraName:   { fontSize: 13, fontWeight: '700', color: COLORS.text },
  infraSub:    { fontSize: 10, color: COLORS.muted, fontWeight: '600', marginTop: 2 },
  mapsArrow:   { color: COLORS.primary, fontSize: 18, fontWeight: '900' },
  callBtn:     { color: COLORS.primary, fontSize: 12, fontWeight: '800' },
  routeItem:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  routeDot:    { width: 10, height: 10, borderRadius: 5 },
  traceStep:   { borderLeftWidth: 2, marginLeft: 10, paddingLeft: 12, paddingBottom: 12 },
  traceStepInner: { gap: 4 },
  traceDotWrap: { alignItems: 'center', width: 16 },
  traceDot:    { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  traceLine:   { flex: 1, width: 1, backgroundColor: COLORS.border, marginTop: 4 },
  traceContent: { flex: 1, paddingBottom: 16 },
  traceAgentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  agentBadge:  { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  traceAgent:  { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  confBadge:   { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  confBadgeText: { fontSize: 9, fontWeight: '900' },
  traceDecision: { fontSize: 12, color: COLORS.text, fontWeight: '700', lineHeight: 16 },
  traceReason: { fontSize: 10, color: COLORS.muted, fontWeight: '600', lineHeight: 14, fontStyle: 'italic' },
  stageBlock:  { marginBottom: 14 },
  stageHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderLeftWidth: 3, marginBottom: 4 },
  stageIcon:   { fontSize: 14 },
  stageLabel:  { fontSize: 9, fontWeight: '900', letterSpacing: 2 },

  // Commander summary
  commanderCard: { marginHorizontal: 14, marginBottom: 0, backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.warning + '40', borderLeftWidth: 3, borderLeftColor: COLORS.warning },
  commanderHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  commanderIcon:   { fontSize: 16 },
  commanderLabel:  { fontSize: 8, fontWeight: '900', color: COLORS.warning, letterSpacing: 1.5 },
  commanderText:   { fontSize: 12, color: COLORS.text, fontStyle: 'italic', lineHeight: 18, fontWeight: '600' },

  // Messages tab
  msgCard: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 3, marginBottom: 12, gap: 8 },
  msgTitle: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  msgBody:  { fontSize: 12, color: COLORS.text, lineHeight: 18, fontWeight: '500' },
});
