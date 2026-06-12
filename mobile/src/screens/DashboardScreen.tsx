import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl,
  TouchableOpacity, ActivityIndicator, StatusBar, Animated, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, Incident, BASE_URL } from '../services/api';
import { authApi } from '../services/auth';
import { MOCK_INCIDENTS, MOCK_RESOURCES } from '../mocks/incidents';
import { getSocket } from '../services/socket';
import CrisisCard from '../components/CrisisCard';
import LogicTraceSheet from '../components/LogicTraceSheet';
import { COLORS, STATUS_COLOR } from '../theme';

interface Props { navigation: any; }
type SeverityFilter = 'all' | 'critical' | 'high' | 'active';

export default function DashboardScreen({ navigation }: Props) {
  const [incidents, setIncidents]     = useState<Incident[]>([]);
  const [resources, setResources]     = useState<any>(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [filter, setFilter]           = useState<SeverityFilter>('all');
  const [traceIncident, setTraceIncident] = useState<Incident | null>(null);
  const [autonomousActions, setAutonomousActions] = useState<any[]>([]);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const tickerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
    // Fetch autonomous actions
    fetch(`${BASE_URL}/api/autonomous-actions`)
      .then(r => r.json())
      .then(d => setAutonomousActions(d.actions?.slice(0, 4) ?? []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      // Try user-scoped nearby incidents first; fall back to all active crises
      let incidents: Incident[] = [];
      let resourceMap: any = null;
      try {
        const nearby = await authApi.getNearbyIncidents();
        incidents  = nearby.incidents ?? [];
        resourceMap = nearby.resourceMap ?? null;
      } catch {
        const data = await api.getActiveCrises();
        incidents   = data.incidents ?? [];
        resourceMap = data.resourceMap ?? null;
      }
      setIncidents(incidents);
      setResources(resourceMap);
      setError(null);
    } catch {
      setIncidents(MOCK_INCIDENTS);
      setResources(MOCK_RESOURCES);
      setError('Demo mode — using mock data (backend offline)');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));

    const socket = getSocket();
    socket.on('incident:created',   () => load());
    socket.on('incident:updated',   () => load());
    socket.on('incident:retracted', () => load());
    socket.on('resources:updated',  (data: any) => setResources(data));

    return () => {
      socket.off('incident:created');
      socket.off('incident:updated');
      socket.off('incident:retracted');
      socket.off('resources:updated');
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const pool = resources?.pool ?? {};
  const avail = resources?.available ?? {};

  const filteredIncidents = incidents.filter(i => {
    if (filter === 'critical') return i.severity === 'critical';
    if (filter === 'high')     return i.severity === 'critical' || i.severity === 'high';
    if (filter === 'active')   return i.status !== 'closed' && i.status !== 'retracted';
    return true;
  });

  const critCount = incidents.filter(i => i.severity === 'critical').length;
  const highCount = incidents.filter(i => i.severity === 'high').length;
  const activeCount = incidents.filter(i => i.status !== 'closed' && i.status !== 'retracted').length;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.loadText}>Connecting to NEXUS…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* ── Top HUD header ── */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
          <View>
            <Text style={styles.nexusLabel}>NEXUS</Text>
            <Text style={styles.nexusSub}>Crisis Intelligence</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.reportBtn} onPress={() => navigation.navigate('Report')}>
          <Text style={styles.reportBtnText}>+ Report</Text>
        </TouchableOpacity>
      </View>

      {/* ── Stat cards ── */}
      <View style={styles.statRow}>
        {[
          { label: 'CRITICAL', value: critCount, color: COLORS.error },
          { label: 'HIGH',     value: highCount, color: COLORS.warning },
          { label: 'ACTIVE',   value: activeCount, color: COLORS.primary },
          { label: 'TOTAL',    value: incidents.length, color: COLORS.muted },
        ].map(s => (
          <View key={s.label} style={[styles.statCard, { borderColor: s.color + '30' }]}>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* ── Resource utilization ── */}
      {pool && Object.keys(pool).length > 0 && (
        <View style={styles.resourceSection}>
          <Text style={styles.sectionLabel}>RESOURCE UTILIZATION</Text>
          <View style={styles.resourceGrid}>
            {(['ambulance', 'police', 'fire', 'drone'] as const).map(k => {
              const total = pool[k] ?? 0;
              const free  = avail[k] ?? 0;
              const used  = total - free;
              const pct   = total > 0 ? used / total : 0;
              const barColor = pct > 0.8 ? COLORS.error : pct > 0.5 ? COLORS.warning : COLORS.success;
              return (
                <View key={k} style={styles.resCard}>
                  <Text style={styles.resEmoji}>{k === 'ambulance' ? '🚑' : k === 'police' ? '🚔' : k === 'fire' ? '🚒' : '🛸'}</Text>
                  <View style={styles.resBarBg}>
                    <View style={[styles.resBarFill, { width: `${pct * 100}%` as any, backgroundColor: barColor }]} />
                  </View>
                  <View style={styles.resStats}>
                    <Text style={[styles.resPct, { color: barColor }]}>{Math.round(pct * 100)}%</Text>
                    <Text style={styles.resCount}>{used}/{total}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Autonomous Actions Feed ── */}
      {autonomousActions.length > 0 && (
        <View style={styles.intelSection}>
          <View style={styles.intelHeader}>
            <View style={styles.intelDot} />
            <Text style={styles.sectionLabel}>AUTONOMOUS INTEL FEED</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.intelScroll}>
            {autonomousActions.map((action: any, i: number) => (
              <View key={i} style={styles.intelCard}>
                <Text style={styles.intelType}>{action.type ?? 'AI ACTION'}</Text>
                <Text style={styles.intelText} numberOfLines={2}>{(action.actions?.[0] ?? action.description ?? 'Autonomous action taken')}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Filter chips ── */}
      <View style={styles.filterRow}>
        {(['all', 'critical', 'high', 'active'] as SeverityFilter[]).map(f => (
          <TouchableOpacity key={f} onPress={() => setFilter(f)}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, filter === f && { color: COLORS.primary }]}>
              {f === 'all' ? 'All' : f === 'critical' ? '🚨 Crit' : f === 'high' ? '⚠️ High+' : '▶ Active'}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        <Text style={styles.countHint}>{filteredIncidents.length} showing</Text>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠ {error}</Text>
        </View>
      )}

      {/* ── Incident list ── */}
      <FlatList
        data={filteredIncidents}
        keyExtractor={i => i.incidentId}
        renderItem={({ item, index }) => (
          <View>
            <CrisisCard
              incident={item}
              index={index}
              onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
            />
            {/* Logic Trace trigger */}
            {item.traceLog && item.traceLog.length > 0 && (
              <TouchableOpacity
                style={styles.traceBtn}
                onPress={() => setTraceIncident(item)}
              >
                <Text style={styles.traceBtnText}>⚡ View AI Reasoning</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🟢</Text>
            <Text style={styles.emptyTitle}>All Clear</Text>
            <Text style={styles.emptySub}>No active crises detected</Text>
          </View>
        }
      />

      {/* Logic Trace bottom sheet */}
      <LogicTraceSheet
        visible={!!traceIncident}
        incident={traceIncident}
        onClose={() => setTraceIncident(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadText: { color: COLORS.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2 },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 1, borderColor: COLORS.border,
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pulseRing: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primary + '20',
    borderWidth: 1.5, borderColor: COLORS.primary + '60',
  },
  nexusLabel: { color: COLORS.primary, fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  nexusSub: { color: COLORS.muted, fontSize: 8, letterSpacing: 1, marginTop: 1 },
  reportBtn: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  reportBtnText: { color: '#000', fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  statRow: {
    flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 12, gap: 8,
  },
  statCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 12,
    paddingVertical: 10, alignItems: 'center', borderWidth: 1,
  },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 7, color: COLORS.muted, fontWeight: '900', letterSpacing: 1.5, marginTop: 2 },

  sectionLabel: { fontSize: 8, fontWeight: '900', color: COLORS.muted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  resourceSection: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderColor: COLORS.border },
  resourceGrid: { flexDirection: 'row', gap: 8 },
  resCard: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 10, padding: 8, gap: 4, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  resEmoji: { fontSize: 18 },
  resBarBg: { width: '100%', height: 3, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' },
  resBarFill: { height: '100%', borderRadius: 2 },
  resStats: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  resPct: { fontSize: 10, fontWeight: '900' },
  resCount: { fontSize: 8, fontWeight: '700', color: COLORS.dimmed },
  intelSection: { paddingVertical: 10, borderBottomWidth: 1, borderColor: COLORS.border },
  intelHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, marginBottom: 8 },
  intelDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  intelScroll: { paddingHorizontal: 14, gap: 8 },
  intelCard: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 10, width: 160, borderWidth: 1, borderColor: COLORS.primary + '30', borderLeftWidth: 2, borderLeftColor: COLORS.primary },
  intelType: { fontSize: 7, fontWeight: '900', color: COLORS.primary, letterSpacing: 1.5, marginBottom: 4 },
  intelText: { fontSize: 10, color: COLORS.text, fontWeight: '600', lineHeight: 14 },

  filterRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  filterChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  filterChipActive: { backgroundColor: COLORS.primary + '18', borderColor: COLORS.primary },
  filterChipText: { color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  countHint: { color: COLORS.dimmed, fontSize: 9, fontWeight: '700' },

  list: { paddingHorizontal: 14, paddingBottom: 100 },
  traceBtn: {
    marginHorizontal: 4, marginTop: -6, marginBottom: 8,
    backgroundColor: COLORS.accent + '18',
    borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12,
    borderWidth: 1, borderColor: COLORS.accent + '40',
    alignSelf: 'flex-start',
  },
  traceBtnText: { color: COLORS.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  errorBanner: {
    marginHorizontal: 14, marginBottom: 6,
    backgroundColor: COLORS.error + '15', borderRadius: 10,
    padding: 10, borderWidth: 1, borderColor: COLORS.error + '40',
  },
  errorText: { color: COLORS.error, fontSize: 11, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 70, gap: 10 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 2 },
  emptySub: { fontSize: 12, color: COLORS.muted, fontWeight: '600' },
});
