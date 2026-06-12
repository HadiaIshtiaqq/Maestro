import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import { authApi, saveSession } from '../services/auth';
import { COLORS } from '../theme';

export default function LoginScreen({ navigation }: any) {
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    if (!phone || !password) return Alert.alert('Required', 'Enter your phone and password.');
    setLoading(true);
    try {
      const result = await authApi.login({ phone: phone.trim(), password });
      await saveSession(result.token, result.user);
      navigation.replace('Main');
    } catch (e: any) {
      Alert.alert('Login failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.sub}>Sign in to NEXUS to view crisis alerts in your area</Text>

          <View style={styles.form}>
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Phone Number</Text>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+923001234567" placeholderTextColor={COLORS.muted} keyboardType="phone-pad" autoComplete="tel" />
            </View>
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Password</Text>
              <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={COLORS.muted} secureTextEntry />
            </View>
          </View>

          <TouchableOpacity style={[styles.submit, (!phone || !password) && styles.disabled]} onPress={handleLogin} disabled={loading || !phone || !password}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.submitText}>Sign In →</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('Register')}>
            <Text style={styles.linkText}>New to NEXUS? <Text style={{ color: COLORS.primary }}>Create Account</Text></Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, padding: 28 },
  back:      { marginBottom: 32 },
  backText:  { color: COLORS.muted, fontWeight: '700', fontSize: 14 },
  title:     { fontSize: 30, fontWeight: '900', color: COLORS.text, marginBottom: 8 },
  sub:       { fontSize: 13, color: COLORS.muted, marginBottom: 36, lineHeight: 20, fontWeight: '600' },
  form:      { gap: 20, marginBottom: 28 },
  fieldWrap: { gap: 8 },
  label:     { fontSize: 11, fontWeight: '900', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1 },
  input:     { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  submit:    { backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  disabled:  { opacity: 0.4 },
  submitText: { color: '#000', fontSize: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  link:      { marginTop: 20, alignItems: 'center' },
  linkText:  { color: COLORS.muted, fontSize: 13, fontWeight: '600' },
});
