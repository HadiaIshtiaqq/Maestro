import React, { useEffect, useRef } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Animated, Dimensions, Platform,
} from 'react-native';
import { COLORS, STATUS_COLOR } from '../theme';
import { Incident } from '../services/api';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = SCREEN_H * 0.82;

interface TraceStep {
  step: string;
  agent: string;
  decision: string;
  reason: string;
  timestamp?: number;
}

interface Props {
  visible: boolean;
  incident: Incident | null;
  onClose: () => void;
}

const AGENT_COLOR: Record<string, string> = {
  'language-agent':    '#00F0FF',
  'signal-fusion':     '#3a7bd5',
  'credibility-agent': '#F59E0B',
  'crisis-classifier': '#FF8A00',
  'severity-agent':    '#FF3B5C',
  'resource-allocator':'#00E676',
  'incident-commander':'#7C3AED',
  'fallback':          COLORS.muted,
};

const AGENT_EMOJI: Record<string, string> = {
  'language-agent':    '🌐',
  'signal-fusion':     '🔗',
  'credibility-agent': '🔍',
  'crisis-classifier': '🏷️',
  'severity-agent':    '📊',
  'resource-allocator':'🚑',
  'incident-commander':'🎖️',
  'fallback':          '⚠️',
};

function StepRow({ step, index, totalSteps }: { step: TraceStep; index: number; totalSteps: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 380,
      delay: index * 90,
      useNativeDriver: true,
    }).start();
  }, []);

  const agentKey = Object.keys(AGENT_COLOR).find(k => step.agent?.toLowerCase().includes(k)) ?? 'fallback';
  const color = AGENT_COLOR[agentKey];
  const emoji = AGENT_EMOJI[agentKey] ?? '⚙️';
  const isLast = index === totalSteps - 1;

  return (
    <Animated.View style={[styles.stepRow, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
      {/* Timeline spine */}
      <View style={styles.timeline}>
        <View style={[styles.dot, { borderColor: color, backgroundColor: color + '30' }]}>
          <Text style={{ fontSize: 10 }}>{emoji}</Text>
        </View>
        {!isLast && <View style={[styles.spine, { backgroundColor: color + '40' }]} />}
      </View>

      {/* Content */}
      <View style={[styles.stepCard, { borderColor: color + '40' }]}>
        <View style={styles.stepHeader}>
          <View style={[styles.agentBadge, { backgroundColor: color + '20', borderColor: color + '50' }]}>
            <Text style={[styles.agentLabel, { color }]}>{step.agent?.toUpperCase().replace(/-/g, ' ')}</Text>
          </View>
          <Text style={styles.stepNum}>{step.step}</Text>
        </View>
        <Text style={styles.decision}>{step.decision}</Text>
        {step.reason ? (
          <Text style={styles.reason}>↳ {step.reason}</Text>
        ) : null}
        {step.timestamp ? (
          <Text style={styles.ts}>{new Date(step.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

export default function LogicTraceSheet({ visible, incident, onClose }: Props) {
  const slideAnim = useRef(new Animated.Value(SHEET_H)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 65,
        friction: 12,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SHEET_H,
        duration: 260,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  if (!incident) return null;

  const steps: TraceStep[] = incident.traceLog ?? [];
  const conf = Math.round((incident.confidence ?? 0) * 100);
  const sevColor = STATUS_COLOR[incident.severity] ?? COLORS.muted;
  const cb = incident.confidenceBreakdown;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop */}
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

      {/* Sheet */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Handle */}
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.sevDot, { backgroundColor: sevColor }]} />
            <View>
              <Text style={styles.incType}>{incident.type?.replace(/_/g, ' ').toUpperCase()}</Text>
              <Text style={styles.incId}>INC-{incident.incidentId?.slice(0, 8)}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.confBadge, { borderColor: COLORS.primary + '50' }]}>
              <Text style={[styles.confText, { color: COLORS.primary }]}>{conf}%</Text>
              <Text style={styles.confLabel}>CONF</Text>
            </View>
          </View>
        </View>

        {/* Confidence breakdown bars */}
        {cb && (
          <View style={styles.cbWrap}>
            {([
              { key: 'socialMedia', label: 'SOCIAL',  color: '#3a7bd5' },
              { key: 'weather',     label: 'WEATHER', color: '#00F0FF' },
              { key: 'mapsTraffic', label: 'TRAFFIC', color: '#00E676' },
            ] as const).map(({ key, label, color }) => {
              const src = (cb as any)[key];
              if (!src) return null;
              const pct = Math.round((src.score ?? 0) * 100);
              return (
                <View key={key} style={styles.cbRow}>
                  <Text style={[styles.cbLabel, { color }]}>{label}</Text>
                  <View style={styles.cbBarBg}>
                    <View style={[styles.cbBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                  </View>
                  <Text style={[styles.cbPct, { color }]}>{pct}%</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Divider */}
        <View style={styles.divider} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionTitle}>AGENT REASONING TRACE</Text>

          {steps.length === 0 ? (
            <View style={styles.emptyTrace}>
              <Text style={styles.emptyText}>No trace log available for this incident.</Text>
            </View>
          ) : (
            steps.map((s, i) => (
              <StepRow key={`${s.step}-${i}`} step={s} index={i} totalSteps={steps.length} />
            ))
          )}

          {/* Allocated resources */}
          {incident.allocatedResources && (
            <View style={styles.resourceSection}>
              <Text style={styles.sectionTitle}>ALLOCATED RESOURCES</Text>
              <View style={styles.resourceRow}>
                {[
                  { label: '🚑 Ambulance', count: incident.allocatedResources.ambulance, color: COLORS.error },
                  { label: '🚔 Police',    count: incident.allocatedResources.police,    color: COLORS.secondary },
                  { label: '🚒 Fire',      count: incident.allocatedResources.fire,      color: COLORS.warning },
                  { label: '🛸 Drone',     count: incident.allocatedResources.drone,     color: COLORS.accent },
                ].map(r => (
                  <View key={r.label} style={[styles.resourceChip, { borderColor: r.color + '50' }]}>
                    <Text style={styles.resourceEmoji}>{r.label.split(' ')[0]}</Text>
                    <Text style={[styles.resourceCount, { color: r.color }]}>{r.count}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Close button */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>CLOSE TRACE</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: SHEET_H,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: COLORS.borderHi,
    overflow: 'hidden',
  },
  handleWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  sevDot: { width: 10, height: 10, borderRadius: 5 },
  incType: { color: COLORS.text, fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  incId: { color: COLORS.muted, fontSize: 9, fontFamily: FONTS.mono, marginTop: 2, letterSpacing: 1 },
  headerRight: {},
  confBadge: {
    alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1, backgroundColor: COLORS.surface2,
  },
  confText: { fontSize: 16, fontWeight: '900' },
  confLabel: { fontSize: 7, color: COLORS.muted, fontWeight: '700', letterSpacing: 1.5, marginTop: 1 },
  cbWrap: { paddingHorizontal: 20, gap: 6, marginBottom: 12 },
  cbRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cbLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1.5, width: 52 },
  cbBarBg: { flex: 1, height: 4, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' },
  cbBarFill: { height: '100%', borderRadius: 2 },
  cbPct: { fontSize: 9, fontWeight: '900', width: 30, textAlign: 'right' },
  divider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 20 },
  scroll: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  sectionTitle: {
    color: COLORS.muted, fontSize: 9, fontWeight: '900',
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14,
  },
  stepRow: { flexDirection: 'row', marginBottom: 8 },
  timeline: { alignItems: 'center', marginRight: 12, width: 28 },
  dot: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  spine: { width: 1.5, flex: 1, marginTop: 4, marginBottom: 4 },
  stepCard: {
    flex: 1, backgroundColor: COLORS.surface2, borderRadius: 12,
    padding: 12, borderWidth: 1, marginBottom: 8,
  },
  stepHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  agentBadge: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  agentLabel: { fontSize: 7, fontWeight: '900', letterSpacing: 1.2 },
  stepNum: { fontSize: 8, color: COLORS.dimmed, fontWeight: '700' },
  decision: { color: COLORS.text, fontSize: 11, fontWeight: '600', lineHeight: 16, marginBottom: 4 },
  reason: { color: COLORS.muted, fontSize: 10, lineHeight: 14, fontStyle: 'italic' },
  ts: { color: COLORS.dimmed, fontSize: 8, marginTop: 6, fontFamily: FONTS.mono },
  emptyTrace: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: COLORS.muted, fontSize: 12 },
  resourceSection: { marginTop: 20 },
  resourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  resourceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, backgroundColor: COLORS.surface3,
  },
  resourceEmoji: { fontSize: 16 },
  resourceCount: { fontSize: 18, fontWeight: '900' },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  closeBtn: {
    backgroundColor: COLORS.surface2,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closeBtnText: { color: COLORS.muted, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
});

// Import FONTS locally since we need it in styles
import { FONTS } from '../theme';
