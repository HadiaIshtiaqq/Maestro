import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, SafeAreaView, Alert } from 'react-native';
import { authApi, getStoredUser, saveSession } from '../services/auth';
import { COLORS } from '../theme';

// Web fallback: react-native-maps is not supported on web.
// Users can manually enter coordinates or use the browser Geolocation API.
export default function LocationSetupScreen({ navigation }: any) {
  const [lat, setLat]       = useState('');
  const [lng, setLng]       = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const detectGPS = () => {
    if (!navigator.geolocation) { Alert.alert('Not supported', 'Geolocation is not available in this browser.'); return; }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setAddress(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
        setDetecting(false);
      },
      (err) => { Alert.alert('GPS error', err.message); setDetecting(false); },
      { enableHighAccuracy: true }
    );
  };

  const save = async () => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) return Alert.alert('Invalid coordinates', 'Please enter valid latitude and longitude.');
    setSaving(true);
    try {
      const updated = await authApi.updateLocation(latNum, lngNum, address || `${lat}, ${lng}`);
      const storedUser = await getStoredUser();
      await saveSession(storedUser?._id ?? '', { ...storedUser, ...updated });
      navigation.replace('EmergencyContact');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Set Your Location</Text>
        <Text style={styles.sub}>You'll only receive crisis alerts for incidents near your location.</Text>

        <TouchableOpacity style={styles.gpsBtn} onPress={detectGPS} disabled={detecting}>
          {detecting ? <ActivityIndicator color={COLORS.primary} size="small" /> : <Text style={styles.gpsBtnText}>📡  Use Browser GPS</Text>}
        </TouchableOpacity>

        <View style={styles.divider}><View style={styles.line} /><Text style={styles.divTxt}>or enter manually</Text><View style={styles.line} /></View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>LATITUDE</Text>
            <TextInput style={styles.input} value={lat} onChangeText={setLat} placeholder="e.g. 24.9215" placeholderTextColor={COLORS.muted} keyboardType="numeric" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>LONGITUDE</Text>
            <TextInput style={styles.input} value={lng} onChangeText={setLng} placeholder="e.g. 67.0808" placeholderTextColor={COLORS.muted} keyboardType="numeric" />
          </View>
        </View>

        <Text style={styles.label}>ADDRESS (optional)</Text>
        <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Street, City, Country" placeholderTextColor={COLORS.muted} />

        {lat && lng && (
          <View style={styles.preview}>
            <Text style={styles.previewText}>📍 {lat}, {lng}{address ? `  —  ${address}` : ''}</Text>
          </View>
        )}

        <TouchableOpacity style={[styles.saveBtn, (!lat || !lng) && styles.disabled]} onPress={save} disabled={saving || !lat || !lng}>
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Confirm Location →</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, padding: 24, gap: 14 },
  title:     { fontSize: 24, fontWeight: '900', color: COLORS.text, marginBottom: 4 },
  sub:       { fontSize: 12, color: COLORS.muted, lineHeight: 18, fontWeight: '600', marginBottom: 4 },
  gpsBtn:    { backgroundColor: COLORS.surface, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: COLORS.primary + '40' },
  gpsBtnText: { color: COLORS.primary, fontWeight: '800', fontSize: 14 },
  divider:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  line:      { flex: 1, height: 1, backgroundColor: COLORS.border },
  divTxt:    { fontSize: 10, color: COLORS.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  row:       { flexDirection: 'row', gap: 12 },
  label:     { fontSize: 9, fontWeight: '900', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 },
  input:     { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, color: COLORS.text, fontSize: 14, fontWeight: '600', borderWidth: 1, borderColor: COLORS.border },
  preview:   { backgroundColor: COLORS.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: COLORS.primary + '30' },
  previewText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  saveBtn:   { backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  disabled:  { opacity: 0.4 },
  saveBtnText: { color: '#000', fontSize: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
});
