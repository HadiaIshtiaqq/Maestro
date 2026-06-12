import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Animated, StatusBar,
} from 'react-native';
import { getSocket } from '../services/socket';
import { authApi } from '../services/auth';
import { COLORS, STATUS_COLOR } from '../theme';

interface AlertItem {
  id: string;
  type: string;
  severity: string;
  message: string;
  timestamp: Date;
  incidentId?: string;
  read: boolean;
}

const SEV_EMOJI: Record<string, string> = {
  critical: '🚨', high: '⚠️', medium: '🔔', low: 'ℹ️',
};

export default function AlertsScreen({ navigation }: any) {
  const [alerts, setAlerts]       = useState<AlertItem[]>([]);
  const [filter, setFilter]       = useState<'all' | 'unread' | 'critical'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const flashAnim = useRef(new Animated.Value(1)).current;

  const addAlert = useCallback((inc: any) => {
    const newAlert: AlertItem = {
      id:         `${inc.incidentId}-${Date.now()}`,
      type:       inc.type ?? 'Unknown Incident',
      severity:   inc.severity ?? 'medium',
      message:    `${inc.type?.replace(/_/g, ' ')} — ${Math.round((inc.confidence ?? 0) * 100)}% confidence. ${inc.allocatedResources?.ambulance ?? 0} ambulances, ${inc.allocatedResources?.police ?? 0} police dispatched.`,
      timestamp:  new Date(),
      incidentId: inc.incidentId,
      read:       false,
    };
    setAlerts(prev => [newAlert, ...prev].slice(0, 50));

    if (inc.severity === 'critical' || inc.severity === 'high') {
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 0.3, duration: 200, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 1,   duration: 200, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0.3, duration: 200, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 1,   duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, []);

  const loadNearby = useCallback(async () => {
    try {
      const data = await authApi.getNearbyIncidents();
      const initial = (data.incidents ?? []).slice(0, 10).map((inc: any, i: number) => ({
        id:         `init-${inc.incidentId}-${i}`,
        type:       inc.type ?? 'Unknown',
        severity:   inc.severity ?? 'medium',
        message:    `${inc.type?.replace(/_/g, ' ')} — ${Math.round((inc.confidence ?? 0) * 100)}% AI confidence.`,
        timestamp:  new Date(inc.createdAt ?? Date.now()),
        incidentId: inc.incidentId,
        read:       true,
      }));
      setAlerts(prev => [...initial, ...prev.filter(a => !a.id.startsWith('init-'))].slice(0, 50));
    } catch {}
  }, []);

  const addAutonomousAlert = useCallback((action: any) => {
    const newAlert: AlertItem = {
      id:        `auto-${action.incidentId}-${Date.now()}`,
      type:      `Auto: ${action.type?.replace(/_/g, ' ') ?? 'Action'}`,
      severity:  'high',
      message:   (action.actions ?? []).join(' · '),
      timestamp: new Date(),
      incidentId: action.incidentId,
      read:      false,
    };
    setAlerts(prev => [newAlert, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    loadNearby();
    const socket = getSocket();
    socket.on('incident:created', addAlert);
    socket.on('incident:updated', (inc: any) => {
      if (inc.severity === 'critical' || inc.severity === 'high') addAlert(inc);
    });
    socket.on('autonomous:action', addAutonomousAlert);
    return () => {
      socket.off('incident:created');
      socket.off('incident:updated');
      socket.off('autonomous:action');
    };
  }, [addAlert, addAutonomousAlert, loadNearby]);

  const markRead = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  };

  const markAllRead = () => setAlerts(prev => prev.map(a => ({ ...a, read: true })));

  const filtered = alerts.filter(a => {
    if (filter === 'unread')   return !a.read;
    if (filter === 'critical') return a.severity === 'critical';
    return true;
  });

  const unreadCount = alerts.filter(a => !a.read).length;

  const formatTime = (d: Date) => {
    const now  = Date.now();
    const diff = now - new Date(d).getTime();
    if (diff < 60000)  return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Alert Feed</Text>
          <Text style={styles.subtitle}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </Text>
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {(['all', 'unread', 'critical'] as const).map(f => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.chip, filter === f && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f === 'all' ? 'All' : f === 'unread' ? `Unread (${unreadCount})` : '🚨 Critical'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={a => a.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadNearby(); setRefreshing(false); }} tintColor={COLORS.primary} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🟢</Text>
            <Text style={styles.emptyTitle}>No Alerts</Text>
            <Text style={styles.emptySub}>You'll be notified when incidents occur near you</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, !item.read && styles.cardUnread, { borderLeftColor: STATUS_COLOR[item.severity] ?? COLORS.border }]}
            onPress={() => { markRead(item.id); if (item.incidentId) navigation.navigate('Map'); }}
            activeOpacity={0.8}
          >
            <View style={styles.cardTop}>
              <View style={styles.cardLeft}>
                <Text style={styles.sevEmoji}>{SEV_EMOJI[item.severity] ?? 'ℹ️'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardType}>{item.type.replace(/_/g, ' ').toUpperCase()}</Text>
                  <Text style={[styles.sevBadge, { color: STATUS_COLOR[item.severity] ?? COLORS.muted }]}>
                    {item.severity?.toUpperCase()}
                  </Text>
                </View>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
                {!item.read && <View style={styles.unreadDot} />}
              </View>
            </View>
            <Text style={styles.cardMsg} numberOfLines={2}>{item.message}</Text>
            {item.incidentId && (
              <Text style={styles.tapHint}>Tap to view on map →</Text>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 20 },
  title:    { fontSize: 22, fontWeight: '900', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 1 },
  subtitle: { fontSize: 10, color: COLORS.muted, fontWeight: '700', marginTop: 2 },
  markAllBtn: { backgroundColor: COLORS.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border },
  markAllText: { color: COLORS.primary, fontSize: 11, fontWeight: '800' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  chip:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  chipActive:{ backgroundColor: COLORS.primary + '20', borderColor: COLORS.primary },
  chipText:  { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  chipTextActive: { color: COLORS.primary },
  list:  { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  card:  { backgroundColor: COLORS.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 3, gap: 8 },
  cardUnread: { backgroundColor: COLORS.surface + 'ff', borderColor: COLORS.primary + '30' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardLeft: { flexDirection: 'row', gap: 10, flex: 1 },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  sevEmoji: { fontSize: 22 },
  cardType: { fontSize: 13, fontWeight: '900', color: COLORS.text, letterSpacing: 0.5 },
  sevBadge: { fontSize: 10, fontWeight: '800', marginTop: 2 },
  timeText: { fontSize: 10, color: COLORS.muted, fontWeight: '600' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  cardMsg:  { fontSize: 12, color: COLORS.muted, lineHeight: 17, fontWeight: '500' },
  tapHint:  { fontSize: 10, color: COLORS.primary, fontWeight: '700' },
  empty:    { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text, textTransform: 'uppercase' },
  emptySub:   { fontSize: 12, color: COLORS.muted, fontWeight: '600', textAlign: 'center', paddingHorizontal: 32 },
});
