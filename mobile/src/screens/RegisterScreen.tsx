import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { authApi, saveSession } from '../services/auth';
import { COLORS } from '../theme';

export default function RegisterScreen({ navigation }: any) {
  const [name, setName]         = useState('');
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [locating, setLocating] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);

  const detectLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission denied', 'Location access is needed to show alerts in your area.'); return; }
      const pos  = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const geo  = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      const addr = geo[0] ? `${geo[0].name ?? ''} ${geo[0].city ?? ''} ${geo[0].country ?? ''}`.trim() : '';
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, address: addr });
    } catch (e: any) {
      Alert.alert('Location error', e.message);
    } finally {
      setLocating(false);
    }
  };

  const handleRegister = async () => {
    if (!name.trim())     return Alert.alert('Required', 'Please enter your name.');
    if (!phone.trim())    return Alert.alert('Required', 'Please enter your phone number.');
    if (!password.trim()) return Alert.alert('Required', 'Please enter a password.');
    if (!location)        return Alert.alert('Required', 'Please detect your location first.');

    setLoading(true);
    try {
      const result = await authApi.register({ name: name.trim(), phone: phone.trim(), password, location });
      await saveSession(result.token, result.user);
      navigation.replace('LocationSetup');
    } catch (e: any) {
      if (e.message?.toLowerCase().includes('already registered')) {
        Alert.alert(
          'Phone already registered',
          'This number has an account. Sign in instead?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign In', onPress: () => navigation.navigate('Login') },
          ],
        );
      } else {
        Alert.alert('Registration failed', e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.sub}>Join NEXUS to get real-time crisis alerts for your area</Text>

          <View style={styles.form}>
            <Field label="Full Name" value={name} onChangeText={setName} placeholder="Hadia Khan" />
            <Field label="Phone Number" value={phone} onChangeText={setPhone} placeholder="+923001234567" keyboardType="phone-pad" />
            <Field label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />

            <View style={styles.locationField}>
              <Text style={styles.label}>Your Location</Text>
              {location ? (
                <View style={styles.locationResult}>
                  <Text style={styles.locationEmoji}>📍</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.locationAddr} numberOfLines={2}>{location.address || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}</Text>
                    <Text style={styles.locationCoords}>{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</Text>
                  </View>
                  <TouchableOpacity onPress={detectLocation}>
                    <Text style={styles.redetect}>↺</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.detectBtn} onPress={detectLocation} disabled={locating}>
                  {locating ? <ActivityIndicator color={COLORS.primary} size="small" /> : <Text style={styles.detectText}>📍  Detect My Location</Text>}
                </TouchableOpacity>
              )}
              <Text style={styles.hint}>Used to send you alerts for incidents in your area</Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.submit, (!name || !phone || !password || !location) && styles.submitDisabled]} onPress={handleRegister} disabled={loading || !name || !phone || !password || !location}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.submitText}>Create Account →</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.loginLink} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLinkText}>Already have an account? <Text style={{ color: COLORS.primary }}>Sign In</Text></Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: any) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={COLORS.muted} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: COLORS.bg },
  container:  { padding: 24, paddingBottom: 40 },
  back:       { marginBottom: 24 },
  backText:   { color: COLORS.muted, fontWeight: '700', fontSize: 14 },
  title:      { fontSize: 30, fontWeight: '900', color: COLORS.text, marginBottom: 8 },
  sub:        { fontSize: 13, color: COLORS.muted, marginBottom: 32, lineHeight: 20, fontWeight: '600' },
  form:       { gap: 20, marginBottom: 28 },
  fieldWrap:  { gap: 8 },
  label:      { fontSize: 11, fontWeight: '900', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1 },
  input:      { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  locationField: { gap: 8 },
  detectBtn:  { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  detectText: { color: COLORS.primary, fontWeight: '800', fontSize: 14 },
  locationResult: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: COLORS.primary + '40' },
  locationEmoji:  { fontSize: 24 },
  locationAddr:   { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  locationCoords: { color: COLORS.muted, fontSize: 10, marginTop: 2, fontFamily: 'monospace' },
  redetect:   { color: COLORS.primary, fontSize: 22, fontWeight: '700' },
  hint:       { fontSize: 10, color: COLORS.muted, fontWeight: '600' },
  submit:     { backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: '#000', fontSize: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  loginLink:  { marginTop: 20, alignItems: 'center' },
  loginLinkText: { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
});
