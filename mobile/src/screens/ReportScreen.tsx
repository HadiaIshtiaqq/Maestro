import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, SafeAreaView, Animated,
} from 'react-native';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { api } from '../services/api';
import { authApi } from '../services/auth';
import { COLORS, STATUS_COLOR } from '../theme';

const ROMAN_URDU_REGEX = /\b(pani|baadh|aag|baarish|bijli|zalzala|seli|taofan|ghar|sadak|hua|gaya|hai|hain|mein|hum|yahan|wahan|log|madad|emergency|karachi|lahore|islamabad|sector|mohalla)\b/i;
const URDU_ARABIC_REGEX = /[؀-ۿ]/;

function detectLang(text: string): string {
  if (URDU_ARABIC_REGEX.test(text)) return '🇵🇰 Urdu detected';
  if (ROMAN_URDU_REGEX.test(text))  return '🇵🇰 Roman Urdu detected';
  return '';
}

type SubmitResult = { incident?: any; message?: string };

export default function ReportScreen() {
  const [text, setText]           = useState('');
  const [isRecording, setIsRec]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]       = useState<SubmitResult | null>(null);
  const [sosLoading, setSosLoading] = useState(false);
  const [langHint, setLangHint]   = useState('');
  const [location, setLocation]   = useState<{ lat: number; lng: number } | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const pulseAnim    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status === 'granted') {
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(pos => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }).catch(() => {});
      }
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setLangHint(detectLang(text)), 600);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    if (!isRecording) return;
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [isRecording]);

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Permission denied', 'Microphone access is needed for voice reporting.');
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRec(true);
    } catch (e: any) {
      Alert.alert('Recording error', e.message);
    }
  };

  const stopRecording = async () => {
    setIsRec(false);
    try {
      await recordingRef.current?.stopAndUnloadAsync();
      // Audio recorded — in production, send to speech-to-text API
      // For now, inform user
      Alert.alert('Voice Recorded', 'Voice note captured. In production, this uploads to speech-to-text. For demo, type your report below.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    recordingRef.current = null;
  };

  const submit = async () => {
    if (!text.trim()) return Alert.alert('Empty report', 'Please describe the incident.');
    setSubmitting(true);
    setResult(null);
    try {
      const res = await api.ingestSignal({
        source: 'call',
        type:   'mobile_report',
        data: { text: text.trim(), submittedVia: 'MobileApp' },
        location: location ?? undefined,
        urgency: 7,
      });
      setResult(res);
      if (res.incident) setText('');
    } catch (e: any) {
      Alert.alert('Submission failed', e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const triggerSOS = async () => {
    Alert.alert('🆘 Trigger SOS?', 'This will immediately notify your emergency contact via SMS/WhatsApp.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send SOS', style: 'destructive',
        onPress: async () => {
          setSosLoading(true);
          try {
            await authApi.triggerSos('Emergency SOS', 'critical');
            Alert.alert('SOS Sent', 'Your emergency contact has been notified.');
          } catch (e: any) {
            Alert.alert('SOS Error', e.message);
          } finally {
            setSosLoading(false);
          }
        },
      },
    ]);
  };

  const inc = result?.incident;
  const conf = Math.round((inc?.confidence ?? 0) * 100);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Report Incident</Text>
        <Text style={styles.sub}>Describe what you see. The AI agent will verify it using social media, news, weather, and maps.</Text>

        {/* Voice + Text input */}
        <View style={styles.inputCard}>
          <View style={styles.inputHeader}>
            <Text style={styles.inputLabel}>📡 INCIDENT DESCRIPTION</Text>
            {langHint ? <Text style={styles.langHint}>{langHint}</Text> : null}
          </View>

          <TextInput
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            placeholder={'Describe the incident...\nاردو یا Roman Urdu میں بھی لکھ سکتے ہیں'}
            placeholderTextColor={COLORS.muted}
            multiline
            textAlignVertical="top"
          />

          <View style={styles.inputActions}>
            {location && <Text style={styles.gpsTag}>📍 GPS attached</Text>}
            <View style={{ flex: 1 }} />
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={[styles.micBtn, isRecording && styles.micBtnActive]}
                onPress={isRecording ? stopRecording : startRecording}
              >
                <Text style={styles.micEmoji}>{isRecording ? '⏹' : '🎙️'}</Text>
                <Text style={[styles.micLabel, isRecording && { color: '#fff' }]}>
                  {isRecording ? 'Stop' : 'Voice'}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity style={[styles.submitBtn, !text.trim() && styles.disabled]} onPress={submit} disabled={submitting || !text.trim()}>
          {submitting
            ? <><ActivityIndicator color="#000" size="small" /><Text style={styles.submitText}> Analyzing…</Text></>
            : <Text style={styles.submitText}>🚀  Submit Report</Text>
          }
        </TouchableOpacity>

        {/* Result card */}
        {result && (
          <View style={styles.resultCard}>
            {inc ? (
              <>
                <Text style={styles.resultTitle}>✅ Incident Registered</Text>
                <View style={styles.resultGrid}>
                  <ResultItem label="Type"     value={inc.type ?? '—'} />
                  <ResultItem label="Severity" value={inc.severity?.toUpperCase() ?? '—'} color={STATUS_COLOR[inc.severity]} />
                  <ResultItem label="Confidence" value={`${conf}%`} color={conf >= 70 ? COLORS.success : COLORS.caution} />
                  {inc.detectedLanguage && <ResultItem label="Language" value={`${inc.detectedLanguage}${inc.isRomanUrdu ? ' (Roman)' : ''}`} />}
                </View>

                {inc.confidenceBreakdown && (
                  <View style={styles.confBreakdown}>
                    <Text style={styles.confTitle}>3-SOURCE VERIFICATION</Text>
                    {(['socialMedia', 'weather', 'mapsTraffic'] as const).map(src => {
                      const s = inc.confidenceBreakdown[src];
                      if (!s) return null;
                      const pct = Math.round((s.score ?? 0) * 100);
                      return (
                        <View key={src} style={styles.confRow}>
                          <Text style={styles.confSrc}>{src === 'socialMedia' ? '📱 Social' : src === 'weather' ? '🌩 Weather' : '🗺 Maps'}</Text>
                          <View style={styles.confBar}><View style={[styles.confFill, { width: `${pct}%` as any }]} /></View>
                          <Text style={styles.confPct}>{pct}%</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            ) : (
              <Text style={styles.resultMsg}>{result.message ?? 'Report submitted — confidence below threshold.'}</Text>
            )}
          </View>
        )}

        {/* SOS Button */}
        <View style={styles.sosSep}>
          <View style={styles.sepLine} /><Text style={styles.sepText}>EMERGENCY</Text><View style={styles.sepLine} />
        </View>
        <TouchableOpacity style={styles.sosBtn} onPress={triggerSOS} disabled={sosLoading}>
          {sosLoading
            ? <ActivityIndicator color="#fff" />
            : <><Text style={styles.sosEmoji}>🆘</Text><Text style={styles.sosText}>SOS — Notify Emergency Contact</Text></>
          }
        </TouchableOpacity>
        <Text style={styles.sosHint}>Instantly sends SMS/WhatsApp to your registered emergency contact</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ResultItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.resultItem}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={[styles.resultValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: COLORS.bg },
  container:  { padding: 20, paddingBottom: 40 },
  title:      { fontSize: 24, fontWeight: '900', color: COLORS.text, marginBottom: 6, marginTop: 4 },
  sub:        { fontSize: 12, color: COLORS.muted, lineHeight: 18, fontWeight: '600', marginBottom: 20 },
  inputCard:  { backgroundColor: COLORS.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  inputHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  inputLabel: { fontSize: 9, fontWeight: '900', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5 },
  langHint:   { fontSize: 10, color: COLORS.primary, fontWeight: '700' },
  textInput:  { minHeight: 120, color: COLORS.text, fontSize: 15, fontWeight: '500', lineHeight: 22 },
  inputActions: { flexDirection: 'row', alignItems: 'center', marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12 },
  gpsTag:     { fontSize: 10, color: COLORS.success, fontWeight: '700' },
  micBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.border },
  micBtnActive: { backgroundColor: COLORS.error, borderColor: COLORS.error },
  micEmoji:   { fontSize: 18 },
  micLabel:   { fontSize: 11, fontWeight: '800', color: COLORS.primary },
  submitBtn:  { backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  disabled:   { opacity: 0.35 },
  submitText: { color: '#000', fontSize: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  resultCard: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.primary + '30', marginBottom: 24, gap: 16 },
  resultTitle: { fontSize: 15, fontWeight: '900', color: COLORS.primary },
  resultGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  resultItem: { minWidth: '40%', flex: 1 },
  resultLabel: { fontSize: 9, fontWeight: '900', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  resultValue: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  resultMsg:  { fontSize: 13, color: COLORS.muted, fontWeight: '600' },
  confBreakdown: { gap: 10 },
  confTitle:  { fontSize: 9, fontWeight: '900', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 1.5 },
  confRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confSrc:    { fontSize: 11, fontWeight: '700', color: COLORS.muted, width: 72 },
  confBar:    { flex: 1, height: 4, backgroundColor: COLORS.border, borderRadius: 99, overflow: 'hidden' },
  confFill:   { height: 4, backgroundColor: COLORS.primary, borderRadius: 99 },
  confPct:    { fontSize: 11, fontWeight: '900', color: COLORS.primary, width: 30, textAlign: 'right' },
  sosSep:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  sepLine:    { flex: 1, height: 1, backgroundColor: COLORS.border },
  sepText:    { fontSize: 9, fontWeight: '900', color: COLORS.muted, letterSpacing: 2 },
  sosBtn:     { backgroundColor: COLORS.error, borderRadius: 16, paddingVertical: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 },
  sosEmoji:   { fontSize: 22 },
  sosText:    { color: '#fff', fontSize: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  sosHint:    { fontSize: 10, color: COLORS.muted, textAlign: 'center', marginTop: 8, fontWeight: '600' },
});
