import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Switch, Alert, ActivityIndicator, SafeAreaView, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { authApi } from '../services/auth';
import { COLORS } from '../theme';

export default function EmergencyContactScreen({ navigation, route }: any) {
  const fromProfile = route?.params?.fromProfile ?? false;

  const [name, setName]               = useState('');
  const [phone, setPhone]             = useState('');
  const [email, setEmail]             = useState('');
  const [relationship, setRelationship] = useState('Family');
  const [notifyWA, setNotifyWA]         = useState(true);
  const [notifyEmail, setNotifyEmail]   = useState(true);
  const [saving, setSaving]             = useState(false);

  const relationships = ['Family', 'Spouse', 'Friend', 'Colleague', 'Other'];

  const save = async () => {
    if (!name.trim() || !phone.trim()) return Alert.alert('Required', 'Name and phone are required.');
    setSaving(true);
    try {
      await authApi.updateEmergencyContact({ name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, relationship, notifyViaWhatsapp: notifyWA, notifyViaEmail: notifyEmail });
      if (fromProfile) {
        Alert.alert('Saved', 'Emergency contact updated.');
        navigation.goBack();
      } else {
        navigation.replace('Main');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {fromProfile && (
            <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
          )}

          <View style={styles.icon}><Text style={{ fontSize: 48 }}>🆘</Text></View>
          <Text style={styles.title}>Emergency Contact</Text>
          <Text style={styles.sub}>
            When you trigger SOS or a high-severity incident hits your area, Maestro automatically
            notifies this person via SMS or WhatsApp.
          </Text>

          <View style={styles.form}>
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Contact Name</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Ahmed Khan" placeholderTextColor={COLORS.muted} />
            </View>
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Phone (with country code)</Text>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+923001234567" placeholderTextColor={COLORS.muted} keyboardType="phone-pad" />
            </View>
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Email (optional — for alerts)</Text>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="contact@email.com" placeholderTextColor={COLORS.muted} keyboardType="email-address" autoCapitalize="none" />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Relationship</Text>
              <View style={styles.chips}>
                {relationships.map(r => (
                  <TouchableOpacity key={r} style={[styles.chip, relationship === r && styles.chipActive]} onPress={() => setRelationship(r)}>
                    <Text style={[styles.chipText, relationship === r && styles.chipTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Notification Methods</Text>
              <View style={styles.toggle}>
                <View>
                  <Text style={styles.toggleLabel}>💬  WhatsApp</Text>
                  <Text style={styles.toggleSub}>Via Meta WhatsApp Cloud API</Text>
                </View>
                <Switch value={notifyWA} onValueChange={setNotifyWA} trackColor={{ true: '#25D366' }} thumbColor="#fff" />
              </View>
              <View style={[styles.toggle, { marginTop: 12 }]}>
                <View>
                  <Text style={styles.toggleLabel}>📧  Email</Text>
                  <Text style={styles.toggleSub}>Via Gmail — enter email above</Text>
                </View>
                <Switch value={notifyEmail} onValueChange={setNotifyEmail} trackColor={{ true: COLORS.primary }} thumbColor="#fff" />
              </View>
            </View>
          </View>

          <TouchableOpacity style={[styles.save, (!name || !phone) && styles.disabled]} onPress={save} disabled={saving || !name || !phone}>
            {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveText}>{fromProfile ? 'Save Contact' : 'Finish Setup →'}</Text>}
          </TouchableOpacity>

          {!fromProfile && (
            <TouchableOpacity style={styles.skip} onPress={() => navigation.replace('Main')}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: COLORS.bg },
  container: { padding: 24, paddingBottom: 40 },
  back:      { marginBottom: 20 },
  backText:  { color: COLORS.muted, fontWeight: '700', fontSize: 14 },
  icon:      { alignItems: 'center', marginBottom: 16 },
  title:     { fontSize: 26, fontWeight: '900', color: COLORS.text, marginBottom: 8, textAlign: 'center' },
  sub:       { fontSize: 12, color: COLORS.muted, lineHeight: 18, textAlign: 'center', marginBottom: 28, fontWeight: '600' },
  form:      { gap: 20, marginBottom: 28 },
  fieldWrap: { gap: 8 },
  label:     { fontSize: 11, fontWeight: '900', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1 },
  input:     { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  chips:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  chipActive: { backgroundColor: COLORS.primary + '20', borderColor: COLORS.primary },
  chipText:  { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: COLORS.primary },
  card:      { backgroundColor: COLORS.surface, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: COLORS.border },
  cardTitle: { fontSize: 11, fontWeight: '900', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },
  toggle:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  toggleSub:   { fontSize: 10, color: COLORS.muted, marginTop: 2, fontWeight: '600' },
  save:      { backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  disabled:  { opacity: 0.4 },
  saveText:  { color: '#000', fontSize: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  skip:      { marginTop: 16, alignItems: 'center' },
  skipText:  { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
});
