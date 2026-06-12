import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { Incident } from '../services/api';
import { COLORS, STATUS_COLOR } from '../theme';

interface Props {
  incident: Incident;
  onPress:  () => void;
  index?:   number;
}

const TYPE_EMOJI: Record<string, string> = {
  Flood: '🌊', flood: '🌊',
  Heatwave: '🔥', heatwave: '🔥',
  Earthquake: '🌍', earthquake: '🌍',
  Accident: '💥', accident: '💥',
  Fire: '🚒', fire: '🚒',
  Default: '🚨',
};

export default function CrisisCard({ incident, onPress, index = 0 }: Props) {
  const color = STATUS_COLOR[incident.severity] ?? COLORS.muted;
  const emoji = TYPE_EMOJI[incident.type] ?? TYPE_EMOJI.Default;
  const conf  = Math.round((incident.confidence ?? 0) * 100);
  const time  = new Date(incident.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Entrance animation
  const entranceOpacity = useRef(new Animated.Value(0)).current;
  const entranceY       = useRef(new Animated.Value(24)).current;

  // Confidence bar animation
  const barWidth = useRef(new Animated.Value(0)).current;

  // Pulse glow for critical
  const glowOpacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Staggered entrance
    Animated.parallel([
      Animated.timing(entranceOpacity, {
        toValue: 1, duration: 400,
        delay: index * 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(entranceY, {
        toValue: 0, duration: 400,
        delay: index * 80,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Confidence bar fill
    Animated.timing(barWidth, {
      toValue: conf, duration: 800,
      delay: index * 80 + 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // Critical pulse
    if (incident.severity === 'critical') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowOpacity, { toValue: 0.8, duration: 700, useNativeDriver: true }),
          Animated.timing(glowOpacity, { toValue: 0.2, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    }
  }, []);

  const barWidthPercent = barWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={{ opacity: entranceOpacity, transform: [{ translateY: entranceY }] }}>
      {incident.severity === 'critical' && (
        <Animated.View style={[styles.glow, { backgroundColor: color, opacity: glowOpacity }]} />
      )}
      <TouchableOpacity
        style={[styles.card, { borderLeftColor: color }]}
        onPress={onPress}
        activeOpacity={0.82}
      >
        <View style={styles.header}>
          <Text style={styles.emoji}>{emoji}</Text>
          <View style={styles.titleBlock}>
            <Text style={styles.type} numberOfLines={1}>{incident.type}</Text>
            {incident.detectedLanguage && (
              <Text style={styles.lang}>
                {incident.isRomanUrdu ? '🇵🇰 Roman Urdu' : `🌐 ${incident.detectedLanguage}`}
              </Text>
            )}
          </View>
          <View style={[styles.badge, { backgroundColor: color + '22', borderColor: color }]}>
            <Text style={[styles.badgeText, { color }]}>{incident.severity?.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>CONFIDENCE</Text>
            <View style={styles.confBarTrack}>
              <Animated.View style={[styles.confFill, { width: barWidthPercent, backgroundColor: color }]} />
            </View>
            <Text style={[styles.metaValue, { color }]}>{conf}%</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>STATUS</Text>
            <Text style={[styles.metaValue, { color: COLORS.primary }]}>{incident.status?.toUpperCase()}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>UPDATED</Text>
            <Text style={styles.metaValue}>{time}</Text>
          </View>
        </View>

        {incident.allocatedResources && (
          <View style={styles.resources}>
            {Object.entries(incident.allocatedResources).map(([k, v]) => v > 0 ? (
              <View key={k} style={styles.resTag}>
                <Text style={styles.resText}>{resourceEmoji(k)} {v}</Text>
              </View>
            ) : null)}
          </View>
        )}

        {(incident as any).metadata?.commanderSummary && (
          <View style={styles.cmdSummary}>
            <Text style={styles.cmdSummaryText} numberOfLines={2}>🎖️ {(incident as any).metadata.commanderSummary}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

function resourceEmoji(key: string) {
  const map: Record<string, string> = { ambulance: '🚑', police: '🚔', fire: '🚒', drone: '🛸' };
  return map[key] ?? '📦';
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute', inset: -2 as any,
    borderRadius: 18, zIndex: -1,
    shadowRadius: 16, shadowOpacity: 0.6,
  } as any,
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16, borderLeftWidth: 3,
    padding: 16, marginBottom: 12, gap: 12,
  },
  header:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji:      { fontSize: 28 },
  titleBlock: { flex: 1 },
  type:       { fontSize: 15, fontWeight: '900', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.5 },
  lang:       { fontSize: 10, color: COLORS.muted, marginTop: 2, fontWeight: '700' },
  badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  badgeText:  { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  row:        { flexDirection: 'row', gap: 12 },
  metaItem:   { flex: 1 },
  metaLabel:  { fontSize: 8, fontWeight: '900', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  metaValue:  { fontSize: 11, fontWeight: '900', color: COLORS.text },
  confBarTrack: { height: 3, backgroundColor: COLORS.border, borderRadius: 99, marginBottom: 3, overflow: 'hidden' },
  confFill:   { height: 3, borderRadius: 99 },
  resources:  { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  resTag:     { backgroundColor: COLORS.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.border },
  resText:    { fontSize: 10, color: COLORS.muted, fontWeight: '700' },
  cmdSummary: { backgroundColor: COLORS.bg, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: COLORS.warning + '30', borderLeftWidth: 2, borderLeftColor: COLORS.warning },
  cmdSummaryText: { fontSize: 10, color: COLORS.muted, fontStyle: 'italic', lineHeight: 14 },
});
