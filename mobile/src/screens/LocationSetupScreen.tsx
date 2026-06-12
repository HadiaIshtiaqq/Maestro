import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, SafeAreaView } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { authApi, getStoredUser, saveSession } from '../services/auth';
import { COLORS } from '../theme';

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4a5568' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1c2230' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1628' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
];

export default function LocationSetupScreen({ navigation }: any) {
  const [pin, setPin]         = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState('');
  const [saving, setSaving]   = useState(false);
  const [detecting, setDetecting] = useState(false);
  const mapRef = useRef<MapView>(null);

  const detectGPS = async () => {
    setDetecting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission denied'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude: lat, longitude: lng } = pos.coords;
      const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const addr = geo[0] ? `${geo[0].name ?? ''}, ${geo[0].city ?? ''}, ${geo[0].country ?? ''}`.replace(/^,\s*/, '') : '';
      setPin({ lat, lng });
      setAddress(addr);
      mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }, 600);
    } catch (e: any) {
      Alert.alert('GPS error', e.message);
    } finally {
      setDetecting(false);
    }
  };

  const onMapPress = async (e: any) => {
    const { latitude: lat, longitude: lng } = e.nativeEvent.coordinate;
    setPin({ lat, lng });
    const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }).catch(() => []);
    const addr = geo[0] ? `${geo[0].name ?? ''}, ${geo[0].city ?? ''}, ${geo[0].country ?? ''}`.replace(/^,\s*/, '') : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    setAddress(addr);
  };

  const save = async () => {
    if (!pin) return Alert.alert('Pick a location', 'Tap on the map or use GPS to set your location.');
    setSaving(true);
    try {
      const updated = await authApi.updateLocation(pin.lat, pin.lng, address);
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
      <View style={styles.header}>
        <Text style={styles.title}>Set Your Location</Text>
        <Text style={styles.sub}>Tap the map to pin your location, or use GPS. You'll only receive alerts for incidents in your area.</Text>
      </View>

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          customMapStyle={DARK_MAP_STYLE}
          initialRegion={{ latitude: 24.92, longitude: 67.08, latitudeDelta: 0.4, longitudeDelta: 0.4 }}
          onPress={onMapPress}
          showsUserLocation
        >
          {pin && (
            <Marker coordinate={{ latitude: pin.lat, longitude: pin.lng }}>
              <View style={styles.pinDot}>
                <Text style={{ fontSize: 28 }}>📍</Text>
              </View>
            </Marker>
          )}
        </MapView>

        <TouchableOpacity style={styles.gpsBtn} onPress={detectGPS} disabled={detecting}>
          {detecting ? <ActivityIndicator color={COLORS.primary} size="small" /> : <Text style={styles.gpsBtnText}>📡  Use GPS</Text>}
        </TouchableOpacity>
      </View>

      {pin && (
        <View style={styles.addressBar}>
          <Text style={styles.addressLabel}>📍 SELECTED LOCATION</Text>
          <Text style={styles.addressText} numberOfLines={2}>{address || `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`}</Text>
        </View>
      )}

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.saveBtn, !pin && styles.disabled]} onPress={save} disabled={saving || !pin}>
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Confirm Location →</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: COLORS.bg },
  header:    { padding: 20, paddingBottom: 12 },
  title:     { fontSize: 24, fontWeight: '900', color: COLORS.text, marginBottom: 6 },
  sub:       { fontSize: 12, color: COLORS.muted, lineHeight: 18, fontWeight: '600' },
  mapWrap:   { flex: 1, position: 'relative' },
  map:       { flex: 1 },
  gpsBtn:    { position: 'absolute', bottom: 16, right: 16, backgroundColor: COLORS.surface + 'ee', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border },
  gpsBtnText: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },
  pinDot:    { alignItems: 'center' },
  addressBar: { backgroundColor: COLORS.surface, padding: 16, borderTopWidth: 1, borderTopColor: COLORS.border },
  addressLabel: { fontSize: 9, fontWeight: '900', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  addressText:  { fontSize: 13, color: COLORS.text, fontWeight: '700' },
  footer:    { padding: 20 },
  saveBtn:   { backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  disabled:  { opacity: 0.4 },
  saveBtnText: { color: '#000', fontSize: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
});
