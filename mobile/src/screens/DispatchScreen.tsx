import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, ActivityIndicator, SafeAreaView, StatusBar,
} from 'react-native';
import { authApi, getToken } from '../services/auth';
import { api, BASE_URL } from '../services/api';
import { COLORS } from '../theme';

type ServiceType = 'ambulance' | 'police' | 'fire';

interface DispatchRecord {
  id:        string;
  service:   ServiceType;
  phone:     string;
  incident:  string;
  severity:  string;
  units:     number;
  timestamp: Date;
  sent:      boolean;
}

const SERVICE_CONFIG: Record<ServiceType, { emoji: string; color: string; label: string; defaultPhone: string }> = {
  ambulance: { emoji: '🚑', color: '#ef4444', label: 'Ambulance',    defaultPhone: '1122' },
  police:    { emoji: '🚔', color: '#3b82f6', label: 'Police',        defaultPhone: '15'   },
  fire:      { emoji: '🚒', color: '#f97316', label: 'Fire Brigade',  defaultPhone: '16'   },
};

export default function DispatchScreen() {
  const [service, setService]     = useState<ServiceType>('ambulance');
  const [phone, setPhone]         = useState(SERVICE_CONFIG.ambulance.defaultPhone);
  const [incidentType, setIncType]= useState('');
  const [severity, setSeverity]   = useState<'critical' | 'high' | 'medium'>('high');
  const [units, setUnits]         = useState(1);
  const [sending, setSending]     = useState(false);
  const [history, setHistory]     = useState<DispatchRecord[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [selectedInc, setSelInc]  = useState<any | null>(null);

  useEffect(() => {
    api.getActiveCrises().then(d => setIncidents(d.incidents ?? [])).catch(() => {});
  }, []);

  const handleServiceChange = (s: ServiceType) => {
    setService(s);
    setPhone(SERVICE_CONFIG[s].defaultPhone);
  };

  const dispatch = useCallback(async () => {
    if (!phone.trim()) return Alert.alert('Required', 'Enter a dispatch phone number.');
    setSending(true);
    try {
      const token = await getToken();
      const res = await fetch(`${BASE_URL}/api/users/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          service,
          phone:        phone.trim(),
          incidentId:   selectedInc?.incidentId ?? `MANUAL-${Date.now()}`,
          incidentType: incidentType.trim() || selectedInc?.type || 'Manual Dispatch',
          location:     selectedInc?.location ?? { lat: 24.8607, lng: 67.0011 },
          severity,
          unitsNeeded:  units,
        }),
      }).then(r => r.json());

      const record: DispatchRecord = {
        id:        Date.now().toString(),
        service,
        phone:     phone.trim(),
        incident:  incidentType.trim() || selectedInc?.type || 'Manual',
        severity,
        units,
        timestamp: new Date(),
        sent:      res.sent ?? true,
      };
      setHistory(prev => [record, ...prev].slice(0, 20));
      Alert.alert('✓ Dispatched', `${SERVICE_CONFIG[service].label} alert sent via WhatsApp${res.email ? ' + Email' : ''}.`);
      setIncType(''); setSelInc(null);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSending(false);
    }
  }, [service, phone, incidentType, severity, units, selectedInc]);

  const cfg = SERVICE_CONFIG[service];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <Text style={styles.title}>Quick Dispatch</Text>
        <Text style={styles.sub}>Send immediate WhatsApp alert to emergency services</Text>

        {/* Service selector */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Service</Text>
          <View style={styles.serviceRow}>
            {(Object.keys(SERVICE_CONFIG) as ServiceType[]).map(s => {
              const c = SERVICE_CONFIG[s];
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.serviceBtn, service === s && { borderColor: c.color, backgroundColor: c.color + '15' }]}
                  onPress={() => handleServiceChange(s)}
                >
                  <Text style={styles.serviceEmoji}>{c.emoji}</Text>
                  <Text style={[styles.serviceLabel, service === s && { color: c.color }]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Incident selector from live incidents */}
        {incidents.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Link to Active Incident (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.incRow}>
              <TouchableOpacity
                style={[styles.incChip, !selectedInc && styles.incChipActive]}
                onPress={() => setSelInc(null)}
              >
                <Text style={[styles.incChipText, !selectedInc && { color: COLORS.primary }]}>None</Text>
              </TouchableOpacity>
              {incidents.map(inc => (
                <TouchableOpacity
                  key={inc.incidentId}
                  style={[styles.incChip, selectedInc?.incidentId === inc.incidentId && styles.incChipActive]}
                  onPress={() => { setSelInc(inc); setIncType(inc.type?.replace(/_/g, ' ') ?? ''); }}
                >
                  <Text style={[styles.incChipText, selectedInc?.incidentId === inc.incidentId && { color: COLORS.primary }]}>
                    {inc.type?.replace(/_/g, ' ')?.slice(0, 14)} · {inc.severity?.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Phone */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Dispatch Phone / WhatsApp</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+923001234567"
            placeholderTextColor={COLORS.muted}
            keyboardType="phone-pad"
          />
        </View>

        {/* Incident type */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Incident Type</Text>
          <TextInput
            style={styles.input}
            value={incidentType}
            onChangeText={setIncType}
            placeholder="e.g. Flood, Building Collapse"
            placeholderTextColor={COLORS.muted}
          />
        </View>

        {/* Severity */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Severity</Text>
          <View style={styles.sevRow}>
            {(['critical', 'high', 'medium'] as const).map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.sevChip, severity === s && styles.sevChipActive]}
                onPress={() => setSeverity(s)}
              >
                <Text style={[styles.sevText, severity === s && { color: s === 'critical' ? '#ef4444' : s === 'high' ? '#f97316' : '#3b82f6' }]}>
                  {s.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Units */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Units Needed</Text>
          <View style={styles.unitRow}>
            <TouchableOpacity style={styles.unitBtn} onPress={() => setUnits(u => Math.max(1, u - 1))}>
              <Text style={styles.unitBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.unitVal}>{units}</Text>
            <TouchableOpacity style={styles.unitBtn} onPress={() => setUnits(u => Math.min(20, u + 1))}>
              <Text style={styles.unitBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Dispatch button */}
        <TouchableOpacity
          style={[styles.dispatchBtn, { backgroundColor: cfg.color }, sending && styles.disabled]}
          onPress={dispatch}
          disabled={sending}
        >
          {sending
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.dispatchText}>{cfg.emoji}  Dispatch {cfg.label}</Text>
          }
        </TouchableOpacity>

        {/* History */}
        {history.length > 0 && (
          <View style={styles.histSection}>
            <Text style={styles.sectionLabel}>Dispatch Log</Text>
            {history.map(h => (
              <View key={h.id} style={[styles.histCard, { borderLeftColor: SERVICE_CONFIG[h.service].color }]}>
                <View style={styles.histTop}>
                  <Text style={styles.histEmoji}>{SERVICE_CONFIG[h.service].emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.histType}>{h.incident.replace(/_/g, ' ').toUpperCase()}</Text>
                    <Text style={styles.histMeta}>{h.units} unit{h.units > 1 ? 's' : ''} · {h.severity} · {h.phone}</Text>
                  </View>
                  <View style={[styles.sentBadge, !h.sent && styles.failBadge]}>
                    <Text style={styles.sentText}>{h.sent ? '✓ Sent' : '✗ Failed'}</Text>
                  </View>
                </View>
                <Text style={styles.histTime}>{new Date(h.timestamp).toLocaleTimeString()}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 20, paddingBottom: 40 },
  title:     { fontSize: 24, fontWeight: '900', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  sub:       { fontSize: 12, color: COLORS.muted, fontWeight: '600', marginBottom: 24 },
  section:   { marginBottom: 20 },
  sectionLabel: { fontSize: 10, fontWeight: '900', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 },
  serviceRow: { flexDirection: 'row', gap: 10 },
  serviceBtn: { flex: 1, alignItems: 'center', padding: 14, backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1.5, borderColor: COLORS.border, gap: 6 },
  serviceEmoji: { fontSize: 26 },
  serviceLabel: { fontSize: 10, fontWeight: '900', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  incRow: { flexDirection: 'row' },
  incChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, marginRight: 8 },
  incChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15' },
  incChipText: { fontSize: 11, fontWeight: '700', color: COLORS.muted },
  input:  { backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  sevRow: { flexDirection: 'row', gap: 10 },
  sevChip: { flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  sevChipActive: { backgroundColor: COLORS.bg, borderColor: COLORS.muted },
  sevText: { fontSize: 11, fontWeight: '900', color: COLORS.muted },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: 20, justifyContent: 'center', backgroundColor: COLORS.surface, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: COLORS.border },
  unitBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  unitBtnText: { fontSize: 22, fontWeight: '300', color: COLORS.text },
  unitVal: { fontSize: 28, fontWeight: '900', color: COLORS.text, width: 40, textAlign: 'center' },
  dispatchBtn: { borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  disabled: { opacity: 0.5 },
  dispatchText: { color: '#fff', fontSize: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  histSection: { marginTop: 32 },
  histCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 3, marginTop: 10, gap: 6 },
  histTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  histEmoji: { fontSize: 20 },
  histType: { fontSize: 12, fontWeight: '900', color: COLORS.text, letterSpacing: 0.3 },
  histMeta: { fontSize: 10, color: COLORS.muted, fontWeight: '600', marginTop: 2 },
  sentBadge: { backgroundColor: '#22c55e20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#22c55e40' },
  failBadge: { backgroundColor: '#ef444420', borderColor: '#ef444440' },
  sentText: { fontSize: 10, fontWeight: '900', color: '#22c55e' },
  histTime: { fontSize: 10, color: COLORS.muted, fontWeight: '600' },
});
