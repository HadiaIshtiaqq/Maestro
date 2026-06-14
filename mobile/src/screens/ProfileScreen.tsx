import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, SafeAreaView } from 'react-native';
import { authApi, getStoredUser, clearSession } from '../services/auth';
import { COLORS } from '../theme';

export default function ProfileScreen({ navigation }: any) {
  const [user, setUser]           = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [radius, setRadius]       = useState(15);
  const [savingRadius, setSavingRadius] = useState(false);

  useEffect(() => {
    getStoredUser().then(u => {
      if (u) { setUser(u); setRadius(u.alertRadiusKm ?? 15); }
    }).finally(() => setLoading(false));
    authApi.getMe().then(u => { setUser(u); setRadius(u.alertRadiusKm ?? 15); }).catch(() => {});
  }, []);

  const saveRadius = async (r: number) => {
    setSavingRadius(true);
    try { await authApi.updateAlertRadius(r); setRadius(r); } catch {}
    setSavingRadius(false);
  };

  const logout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await clearSession(); navigation.replace('Welcome'); } },
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.name ?? '?')[0].toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user?.name ?? '—'}</Text>
        <Text style={styles.phone}>{user?.phone ?? '—'}</Text>

        {/* Location */}
        <SectionCard
          title="📍 My Location"
          action="Change"
          onAction={() => navigation.navigate('LocationSetup')}
        >
          {user?.location?.address
            ? <Text style={styles.value}>{user.location.address}</Text>
            : <Text style={styles.muted}>No location set</Text>
          }
          {user?.location?.lat && (
            <Text style={styles.coords}>{user.location.lat.toFixed(5)}, {user.location.lng.toFixed(5)}</Text>
          )}
        </SectionCard>

        {/* Alert radius */}
        <SectionCard title="🔔 Alert Radius">
          <Text style={styles.muted}>Receive alerts for incidents within:</Text>
          <View style={styles.radiusRow}>
            {[5, 10, 15, 25, 50].map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.radiusChip, radius === r && styles.radiusChipActive]}
                onPress={() => saveRadius(r)}
                disabled={savingRadius}
              >
                <Text style={[styles.radiusText, radius === r && styles.radiusTextActive]}>{r} km</Text>
              </TouchableOpacity>
            ))}
          </View>
        </SectionCard>

        {/* Emergency contact */}
        <SectionCard
          title="🆘 Emergency Contact"
          action={user?.emergencyContact ? 'Edit' : 'Add'}
          onAction={() => navigation.navigate('EmergencyContact', { fromProfile: true })}
        >
          {user?.emergencyContact ? (
            <>
              <Text style={styles.value}>{user.emergencyContact.name}</Text>
              <Text style={styles.muted}>{user.emergencyContact.phone} · {user.emergencyContact.relationship}</Text>
              <View style={styles.notifBadges}>
                {user.emergencyContact.notifyViaEmail && <View style={styles.badge}><Text style={styles.badgeText}>📧 Email</Text></View>}
                {user.emergencyContact.notifyViaWhatsapp && <View style={[styles.badge, { borderColor: '#25D366' }]}><Text style={[styles.badgeText, { color: '#25D366' }]}>💬 WhatsApp</Text></View>}
              </View>
            </>
          ) : (
            <Text style={styles.muted}>No emergency contact registered yet</Text>
          )}
        </SectionCard>

        {/* Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            🤖 Maestro AI agents verify every reported incident using social media, news, weather, and maps.
            You receive alerts only within your set radius. Emergency contacts are notified automatically for high-severity incidents.
          </Text>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionCard({ title, children, action, onAction }: any) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {action && <TouchableOpacity onPress={onAction}><Text style={styles.cardAction}>{action}</Text></TouchableOpacity>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: COLORS.bg },
  center:    { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, paddingBottom: 40, alignItems: 'center' },
  avatar:    { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.primary + '20', borderWidth: 2, borderColor: COLORS.primary + '50', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  avatarText: { fontSize: 36, fontWeight: '900', color: COLORS.primary },
  name:      { fontSize: 22, fontWeight: '900', color: COLORS.text, marginTop: 12 },
  phone:     { fontSize: 13, color: COLORS.muted, fontWeight: '600', marginBottom: 24 },
  card:      { width: '100%', backgroundColor: COLORS.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 14, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle:  { fontSize: 12, fontWeight: '900', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1 },
  cardAction: { fontSize: 12, color: COLORS.primary, fontWeight: '800' },
  value:     { fontSize: 14, color: COLORS.text, fontWeight: '700' },
  muted:     { fontSize: 12, color: COLORS.muted, fontWeight: '600' },
  coords:    { fontSize: 10, color: COLORS.muted, fontFamily: 'monospace', marginTop: 2 },
  radiusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  radiusChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg },
  radiusChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15' },
  radiusText: { fontSize: 12, color: COLORS.muted, fontWeight: '700' },
  radiusTextActive: { color: COLORS.primary },
  notifBadges: { flexDirection: 'row', gap: 8, marginTop: 4 },
  badge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  badgeText: { fontSize: 10, color: COLORS.muted, fontWeight: '700' },
  infoCard:  { width: '100%', backgroundColor: COLORS.primary + '08', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.primary + '20', marginBottom: 20 },
  infoText:  { fontSize: 12, color: COLORS.muted, lineHeight: 18, fontWeight: '600' },
  logoutBtn: { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 14, borderWidth: 1, borderColor: COLORS.error + '40' },
  logoutText: { color: COLORS.error, fontWeight: '800', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
});
