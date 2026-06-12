import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Animated } from 'react-native';
import MapView, { Marker, Circle, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { api, Incident } from '../services/api';
import { MOCK_INCIDENTS } from '../mocks/incidents';
import { getSocket } from '../services/socket';
import { COLORS, STATUS_COLOR, SEV_GLOW } from '../theme';
import LogicTraceSheet from '../components/LogicTraceSheet';

const KARACHI_REGION = {
  latitude:       24.92,
  longitude:      67.08,
  latitudeDelta:  0.35,
  longitudeDelta: 0.45,
};

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4a5568' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1117' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1c2230' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#243048' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1628' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

interface Props { navigation: any }

const LAYERS = [
  { key: 'incidents',     label: '🚨', title: 'Incidents' },
  { key: 'hospitals',     label: '🏥', title: 'Hospitals' },
  { key: 'evacuation',    label: '⛺', title: 'Evacuation' },
  { key: 'routes',        label: '🛣️', title: 'Routes' },
];

export default function MapScreen({ navigation }: Props) {
  const [incidents, setIncidents]     = useState<Incident[]>([]);
  const [selected, setSelected]       = useState<Incident | null>(null);
  const [loading, setLoading]         = useState(true);
  const [traceIncident, setTraceIncident] = useState<Incident | null>(null);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set(['incidents', 'hospitals', 'evacuation', 'routes']));
  const mapRef = useRef<MapView>(null);
  const drawerAnim = useRef(new Animated.Value(200)).current;

  const toggleLayer = (key: string) => {
    setActiveLayers(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  useEffect(() => {
    if (selected) {
      Animated.spring(drawerAnim, { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }).start();
    } else {
      Animated.timing(drawerAnim, { toValue: 200, duration: 220, useNativeDriver: true }).start();
    }
  }, [selected]);

  const load = async () => {
    try {
      const data = await api.getActiveCrises();
      setIncidents(data.incidents ?? []);
    } catch {
      setIncidents(MOCK_INCIDENTS);
    }
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
    const socket = getSocket();
    socket.on('incident:created',   () => load());
    socket.on('incident:updated',   () => load());
    socket.on('incident:retracted', () => load());
    return () => { socket.off('incident:created'); socket.off('incident:updated'); socket.off('incident:retracted'); };
  }, []);

  const focusIncident = (inc: Incident) => {
    setSelected(inc);
    mapRef.current?.animateToRegion({
      latitude:      inc.location.lat,
      longitude:     inc.location.lng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.07,
    }, 800);
  };

  const severityColor = (s: string) => STATUS_COLOR[s] ?? COLORS.muted;

  return (
    <View style={styles.container}>
      {loading && (
        <View style={styles.loadOverlay}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      )}

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={KARACHI_REGION}
        customMapStyle={DARK_MAP_STYLE}
        showsUserLocation
        showsMyLocationButton
      >
        {incidents.map(inc => (
          <React.Fragment key={inc.incidentId}>
            {activeLayers.has('incidents') && <>
              <Circle
                center={{ latitude: inc.location.lat, longitude: inc.location.lng }}
                radius={inc.radius ?? 1000}
                fillColor={severityColor(inc.severity) + '20'}
                strokeColor={severityColor(inc.severity) + '80'}
                strokeWidth={1.5}
              />
              <Marker
                coordinate={{ latitude: inc.location.lat, longitude: inc.location.lng }}
                onPress={() => focusIncident(inc)}
              >
                <View style={[styles.markerDot, { backgroundColor: severityColor(inc.severity) }]}>
                  <Text style={styles.markerEmoji}>
                    {inc.type?.toLowerCase().includes('flood') ? '🌊'
                      : inc.type?.toLowerCase().includes('fire') ? '🔥'
                      : inc.type?.toLowerCase().includes('collapse') ? '🏚️'
                      : inc.type?.toLowerCase().includes('power') ? '⚡'
                      : inc.type?.toLowerCase().includes('accident') ? '💥'
                      : '🚨'}
                  </Text>
                </View>
              </Marker>
            </>}

            {activeLayers.has('hospitals') && inc.infrastructureRecommendations?.nearbyHospitals?.map((h: any) => (
              <Marker key={`h-${h.id}`} coordinate={{ latitude: h.lat, longitude: h.lng }} title={h.name} description={`${h.distanceKm}km · ${h.bedsAvailable} beds`}>
                <View style={styles.infraDot}><Text style={{ fontSize: 14 }}>🏥</Text></View>
              </Marker>
            ))}
            {activeLayers.has('evacuation') && inc.infrastructureRecommendations?.evacuationPoints?.map((e: any) => (
              <Marker key={`e-${e.id}`} coordinate={{ latitude: e.lat, longitude: e.lng }} title={e.name}>
                <View style={styles.infraDot}><Text style={{ fontSize: 14 }}>⛺</Text></View>
              </Marker>
            ))}
            {activeLayers.has('evacuation') && inc.infrastructureRecommendations?.waterFacilities?.map((w: any) => (
              <Marker key={`w-${w.id}`} coordinate={{ latitude: w.lat, longitude: w.lng }} title={w.name}>
                <View style={styles.infraDot}><Text style={{ fontSize: 14 }}>💧</Text></View>
              </Marker>
            ))}
            {activeLayers.has('routes') && inc.infrastructureRecommendations?.alternativeRoutes?.map((r: any) =>
              r.waypoints?.length >= 2 ? (
                <Polyline key={`r-${r.id}`}
                  coordinates={r.waypoints.map((w: any) => ({ latitude: w.lat, longitude: w.lng }))}
                  strokeColor={r.status === 'clear' ? COLORS.success : r.status === 'closed' ? COLORS.error : COLORS.caution}
                  strokeWidth={3}
                />
              ) : null
            )}
          </React.Fragment>
        ))}
      </MapView>

      {/* ── Layer controls ── */}
      <View style={styles.layerBar}>
        {LAYERS.map(l => (
          <TouchableOpacity
            key={l.key}
            style={[styles.layerBtn, activeLayers.has(l.key) && styles.layerBtnActive]}
            onPress={() => toggleLayer(l.key)}
          >
            <Text style={styles.layerIcon}>{l.label}</Text>
            <Text style={[styles.layerLabel, activeLayers.has(l.key) && styles.layerLabelActive]}>{l.title}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Animated incident drawer ── */}
      <Animated.View style={[styles.drawer, { transform: [{ translateY: drawerAnim }] }, !selected && { opacity: 0, pointerEvents: 'none' } as any]}>
        {selected && (
          <>
            <View style={styles.drawerHandle} />
            <TouchableOpacity style={styles.drawerClose} onPress={() => setSelected(null)}>
              <Text style={styles.drawerCloseText}>✕</Text>
            </TouchableOpacity>

            {/* Incident type + severity */}
            <View style={styles.drawerRow}>
              <View style={[styles.sevBadge, { backgroundColor: severityColor(selected.severity) + '25', borderColor: severityColor(selected.severity) + '60' }]}>
                <View style={[styles.sevDotInner, { backgroundColor: severityColor(selected.severity) }]} />
                <Text style={[styles.sevBadgeText, { color: severityColor(selected.severity) }]}>{selected.severity?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.drawerType}>{selected.type?.replace(/_/g, ' ').toUpperCase()}</Text>
                <Text style={styles.drawerConf}>{Math.round((selected.confidence ?? 0) * 100)}% conf · {selected.status}</Text>
              </View>
            </View>

            {selected.detectedLanguage && (
              <Text style={styles.drawerLang}>🌐 {selected.detectedLanguage}{selected.isRomanUrdu ? ' · Roman Urdu' : ''}</Text>
            )}

            {/* Resources */}
            {selected.allocatedResources && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                {Object.entries(selected.allocatedResources).map(([k, v]) => (v as number) > 0 ? (
                  <View key={k} style={styles.resChip}>
                    <Text style={styles.resChipText}>{k === 'ambulance' ? '🚑' : k === 'police' ? '🚔' : k === 'fire' ? '🚒' : '🛸'} {v as number}</Text>
                  </View>
                ) : null)}
              </ScrollView>
            )}

            {/* Action buttons */}
            <View style={styles.drawerBtns}>
              <TouchableOpacity style={styles.detailBtn} onPress={() => navigation.navigate('IncidentDetail', { incident: selected })}>
                <Text style={styles.detailBtnText}>Details →</Text>
              </TouchableOpacity>
              {selected.traceLog && selected.traceLog.length > 0 && (
                <TouchableOpacity style={styles.traceBtn} onPress={() => setTraceIncident(selected)}>
                  <Text style={styles.traceBtnText}>⚡ AI Trace</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </Animated.View>

      {/* Floating pill list when nothing selected */}
      {!selected && incidents.length > 0 && (
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={styles.floatingList}
          contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }}
        >
          {incidents.map(inc => (
            <TouchableOpacity
              key={inc.incidentId}
              style={[styles.floatingChip, { borderColor: severityColor(inc.severity) + '80' }]}
              onPress={() => focusIncident(inc)}
            >
              <View style={[styles.sevDot, { backgroundColor: severityColor(inc.severity) }]} />
              <Text style={styles.floatingChipText}>{inc.type?.slice(0, 14)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Logic Trace Sheet */}
      <LogicTraceSheet
        visible={!!traceIncident}
        incident={traceIncident}
        onClose={() => setTraceIncident(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLORS.bg },
  map:         { flex: 1 },
  loadOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 99, backgroundColor: COLORS.bg + 'cc', alignItems: 'center', justifyContent: 'center' },
  markerDot: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.6, shadowRadius: 6, elevation: 8,
  },
  markerEmoji: { fontSize: 18 },
  infraDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.surface + 'f0',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  drawer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, borderColor: COLORS.borderHi,
    padding: 20, paddingBottom: 36, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 24,
  },
  drawerHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 6 },
  drawerClose: { position: 'absolute', top: 16, right: 20, padding: 4 },
  drawerCloseText: { color: COLORS.muted, fontSize: 16 },
  drawerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sevBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
  },
  sevDotInner: { width: 6, height: 6, borderRadius: 3 },
  sevBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  drawerType: { fontSize: 15, fontWeight: '900', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  drawerConf: { fontSize: 9, color: COLORS.muted, marginTop: 2, fontWeight: '700' },
  drawerLang: { fontSize: 10, color: COLORS.muted, fontWeight: '600' },
  drawerBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  detailBtn: {
    flex: 1, backgroundColor: COLORS.primary, borderRadius: 12,
    paddingVertical: 10, alignItems: 'center',
  },
  detailBtnText: { color: '#000', fontWeight: '900', fontSize: 11, letterSpacing: 0.5 },
  traceBtn: {
    flex: 1, backgroundColor: COLORS.accent + '20', borderRadius: 12,
    paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.accent + '50',
  },
  traceBtnText: { color: COLORS.accent, fontWeight: '900', fontSize: 11 },
  resChip: {
    backgroundColor: COLORS.surface2, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: COLORS.border, marginRight: 6,
  },
  resChipText: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  layerBar: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', gap: 6, zIndex: 10 },
  layerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: COLORS.surface + 'ee', borderRadius: 10, paddingVertical: 7, borderWidth: 1, borderColor: COLORS.border },
  layerBtnActive: { backgroundColor: COLORS.primary + '20', borderColor: COLORS.primary + '80' },
  layerIcon: { fontSize: 12 },
  layerLabel: { fontSize: 8, fontWeight: '900', color: COLORS.muted, letterSpacing: 0.5 },
  layerLabelActive: { color: COLORS.primary },
  floatingList: { position: 'absolute', bottom: 16, left: 0, right: 0 },
  floatingChip: {
    backgroundColor: COLORS.surface + 'f0', borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 7,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  floatingChipText: { color: COLORS.text, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  sevDot: { width: 7, height: 7, borderRadius: 4 },
});
