import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, KeyboardAvoidingView, Platform, Animated,
  ActivityIndicator, StatusBar, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { BASE_URL } from '../services/api';
import { COLORS } from '../theme';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  isVoice?: boolean;
}

interface ReadySignal {
  type: string;
  locationLabel: string;
  severity: string;
  description: string;
  urgency: number;
}

interface SubmitResult {
  incidentId: string;
  confidence: number;
  severity: string;
  confidenceBreakdown?: {
    socialMedia?: { score: number; verdict: string };
    weather?: { score: number; verdict: string };
    mapsTraffic?: { score: number; verdict: string };
  };
  allocatedResources?: { ambulance: number; police: number; fire: number; drone: number };
}

const LANGS = [
  { code: 'en',    label: 'English',    flag: '🇺🇸' },
  { code: 'ur',    label: 'اردو',        flag: '🇵🇰' },
  { code: 'roman', label: 'Roman Urdu', flag: '🇵🇰' },
  { code: 'ps',    label: 'Pashto',     flag: '🏔️' },
];

const QUICK_PROMPTS = [
  'Flash flood in Defence',
  'Building collapse Gulshan',
  'Heatwave casualties Korangi',
  'Gas leak PECHS',
];

const AGENT_STAGES = [
  { key: 'language-agent',    label: 'Language Detection', icon: '🌐', color: '#00F0FF' },
  { key: 'credibility-agent', label: 'Signal Fusion',      icon: '📡', color: '#7C3AED' },
  { key: 'severity-agent',    label: 'Severity Analysis',  icon: '⚠️', color: '#FF8A00' },
  { key: 'incident-commander', label: 'Commander',         icon: '🎖️', color: '#00E676' },
];

function RecordingBars({ active }: { active: boolean }) {
  const bars = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current];
  useEffect(() => {
    if (!active) { bars.forEach(b => b.setValue(0.3)); return; }
    const anims = bars.map((b, i) =>
      Animated.loop(Animated.sequence([
        Animated.timing(b, { toValue: 1, duration: 300 + i * 80, useNativeDriver: false }),
        Animated.timing(b, { toValue: 0.2, duration: 300 + i * 80, useNativeDriver: false }),
      ]))
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, [active]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 24 }}>
      {bars.map((b, i) => (
        <Animated.View key={i} style={{
          width: 3, borderRadius: 2, backgroundColor: COLORS.error,
          height: b.interpolate({ inputRange: [0, 1], outputRange: [6, 22] }),
        }} />
      ))}
    </View>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, tension: 70, friction: 10, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={[
      styles.bubbleRow,
      isUser ? styles.bubbleRowUser : styles.bubbleRowModel,
      { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
    ]}>
      {!isUser && (
        <View style={styles.aiAvatar}>
          <Text style={{ fontSize: 14 }}>⚡</Text>
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleModel]}>
        {!isUser && <Text style={styles.aiLabel}>Maestro AI · GEMINI 2.0</Text>}
        {msg.isVoice && <Text style={styles.voiceTag}>🎤 Voice</Text>}
        <Text style={isUser ? styles.bubbleTextUser : styles.bubbleTextModel}>{msg.content}</Text>
      </View>
    </Animated.View>
  );
}

function ConfidenceResult({ result, onClose }: { result: SubmitResult; onClose: () => void }) {
  const conf = Math.round((result.confidence ?? 0) * 100);
  const barAnims = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];
  const bd = result.confidenceBreakdown;

  useEffect(() => {
    const scores = [
      (bd?.socialMedia?.score ?? 0) * 100,
      (bd?.weather?.score ?? 0) * 100,
      (bd?.mapsTraffic?.score ?? 0) * 100,
    ];
    barAnims.forEach((b, i) => {
      Animated.timing(b, { toValue: scores[i], duration: 900, delay: i * 150, useNativeDriver: false }).start();
    });
  }, []);

  const sevColor = result.severity === 'critical' ? COLORS.error : result.severity === 'high' ? COLORS.warning : result.severity === 'medium' ? COLORS.caution : COLORS.success;

  return (
    <View style={styles.resultCard}>
      <View style={styles.resultHeader}>
        <Text style={styles.resultCheck}>✅</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.resultTitle}>INCIDENT FILED</Text>
          <Text style={styles.resultId}>ID: {result.incidentId?.slice(0, 12).toUpperCase()}</Text>
        </View>
        <View style={[styles.sevBadge, { borderColor: sevColor, backgroundColor: sevColor + '20' }]}>
          <Text style={[styles.sevText, { color: sevColor }]}>{result.severity?.toUpperCase()}</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.confRow}>
        <Text style={styles.confLabel}>AI CONFIDENCE</Text>
        <Text style={[styles.confValue, { color: conf >= 80 ? COLORS.success : conf >= 55 ? COLORS.warning : COLORS.error }]}>{conf}%</Text>
      </View>

      {bd && (
        <View style={{ gap: 8 }}>
          {[
            { label: '📱 Social Media', anim: barAnims[0], score: bd.socialMedia?.score, verdict: bd.socialMedia?.verdict },
            { label: '🌩 Weather API',  anim: barAnims[1], score: bd.weather?.score,     verdict: bd.weather?.verdict },
            { label: '🗺 Maps & Traffic', anim: barAnims[2], score: bd.mapsTraffic?.score, verdict: bd.mapsTraffic?.verdict },
          ].map(src => (
            <View key={src.label} style={styles.bdRow}>
              <Text style={styles.bdLabel}>{src.label}</Text>
              <View style={styles.bdBarBg}>
                <Animated.View style={[styles.bdBarFill, {
                  width: (src.anim as Animated.Value).interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
                  backgroundColor: (src.score ?? 0) >= 0.75 ? COLORS.success : (src.score ?? 0) >= 0.5 ? COLORS.warning : COLORS.error,
                }]} />
              </View>
              <Text style={styles.bdPct}>{Math.round((src.score ?? 0) * 100)}%</Text>
            </View>
          ))}
        </View>
      )}

      {result.allocatedResources && (
        <View style={styles.resourceRow}>
          {Object.entries(result.allocatedResources).map(([k, v]) => (v as number) > 0 ? (
            <View key={k} style={styles.resChip}>
              <Text style={styles.resChipText}>{k === 'ambulance' ? '🚑' : k === 'police' ? '🚔' : k === 'fire' ? '🚒' : '🛸'} {v as number}</Text>
            </View>
          ) : null)}
        </View>
      )}

      <View style={styles.agentPipeline}>
        <Text style={styles.pipelineLabel}>AI AGENT PIPELINE</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {AGENT_STAGES.map((s, i) => (
            <React.Fragment key={s.key}>
              <View style={[styles.agentDot, { backgroundColor: s.color + '30', borderColor: s.color }]}>
                <Text style={{ fontSize: 10 }}>{s.icon}</Text>
              </View>
              {i < AGENT_STAGES.length - 1 && <View style={styles.pipelineArrow}><Text style={styles.pipelineArrowText}>→</Text></View>}
            </React.Fragment>
          ))}
        </View>
        <Text style={styles.pipelineNote}>Language → Credibility → Severity → Commander</Text>
      </View>
    </View>
  );
}

export default function AICommandScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'init', role: 'model',
    content: "Maestro AI active. Describe the crisis — location, type, and how many people affected. I'll process it through the 4-agent pipeline.",
  }]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [readySignal, setReadySignal] = useState<ReadySignal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]         = useState<SubmitResult | null>(null);
  const [recording, setRecording]   = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [lang, setLang]             = useState('en');
  const flatRef = useRef<FlatList>(null);

  const scrollToEnd = () => setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Permission needed', 'Microphone access required for voice reports.');
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec);
      setIsRecording(true);
    } catch (e: any) {
      Alert.alert('Recording error', e.message);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    setTranscribing(true);
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      setRecording(null);

      if (!uri) {
        Alert.alert('Recording failed', 'No audio captured. Please try again.');
        return;
      }

      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists || (info as any).size === 0) {
        Alert.alert('Empty recording', 'Nothing was recorded. Speak clearly close to the mic.');
        return;
      }

      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });

      const res = await fetch(`${BASE_URL}/api/voice-transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: base64, mimeType: 'audio/m4a' }),
      });

      const data = await res.json();

      if (data.error) {
        Alert.alert('Transcription error', data.error + '\n\nType your report instead.');
        return;
      }

      const text = data.text?.trim();
      if (!text || text === 'No speech detected.') {
        Alert.alert('No speech detected', 'Speak louder and closer to the mic, then try again.');
        return;
      }

      // Put transcription in input box — user reviews before sending
      setInput(text);
    } catch (e: any) {
      Alert.alert('Voice error', e.message ?? 'Unknown error. Please type your report.');
    } finally {
      setTranscribing(false);
    }
  };

  const send = async (text?: string, isVoice = false) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput('');
    setReadySignal(null);

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content, isVoice };
    const next = [...messages, userMsg];
    setMessages(next);
    setLoading(true);
    scrollToEnd();

    try {
      const res = await fetch(`${BASE_URL}/api/chat/incident`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { id: `m-${Date.now()}`, role: 'model', content: data.reply }]);
      if (data.readyToSubmit && data.signal) setReadySignal(data.signal);
    } catch {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'model', content: 'Connection error — please try again.' }]);
    } finally {
      setLoading(false);
      scrollToEnd();
    }
  };

  const submitReport = async () => {
    if (!readySignal || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}/api/ingest-signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'call', type: readySignal.type ?? 'manual_report',
          urgency: readySignal.urgency ?? 7,
          data: { text: readySignal.description, locationLabel: readySignal.locationLabel, severity: readySignal.severity, submittedVia: 'MobileAICommand', detectedLanguage: lang },
        }),
      });
      const data = await res.json();
      const inc = data.incident;
      setResult({
        incidentId: inc?.incidentId ?? 'unknown',
        confidence: inc?.confidence ?? 0.75,
        severity: inc?.severity ?? readySignal.severity,
        confidenceBreakdown: inc?.confidenceBreakdown,
        allocatedResources: inc?.allocatedResources,
      });
      setReadySignal(null);
      setMessages(prev => [...prev, {
        id: `ok-${Date.now()}`, role: 'model',
        content: `✅ Incident filed through 4-agent pipeline. AI Confidence: ${Math.round((inc?.confidence ?? 0.75) * 100)}%. Resources dispatched.`,
      }]);
    } catch {
      setMessages(prev => [...prev, { id: `ef-${Date.now()}`, role: 'model', content: 'Submission failed — please try again.' }]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Text style={{ fontSize: 18 }}>⚡</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>AI COMMAND</Text>
          <Text style={styles.headerSub}>Gemini 2.0 · 4-Agent Orchestration</Text>
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {/* Language Selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.langScroll} contentContainerStyle={styles.langContent}>
        {LANGS.map(l => (
          <TouchableOpacity key={l.code} style={[styles.langChip, lang === l.code && styles.langChipActive]} onPress={() => setLang(l.code)}>
            <Text style={styles.langFlag}>{l.flag}</Text>
            <Text style={[styles.langLabel, lang === l.code && styles.langLabelActive]}>{l.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Quick prompts */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickScroll} contentContainerStyle={styles.quickContent}>
        {QUICK_PROMPTS.map(q => (
          <TouchableOpacity key={q} style={styles.quickChip} onPress={() => send(q)} activeOpacity={0.7}>
            <Text style={styles.quickText}>{q}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Result card */}
      {result && <ConfidenceResult result={result} onClose={() => setResult(null)} />}

      {/* Chat */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={({ item }) => <MessageBubble msg={item} />}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={scrollToEnd}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={(loading || transcribing) ? (
            <View style={styles.typing}>
              <View style={styles.typingBubble}>
                <ActivityIndicator color={COLORS.accent} size="small" />
                <Text style={styles.typingText}>{transcribing ? 'Transcribing with Gemini…' : 'AI agents processing…'}</Text>
              </View>
            </View>
          ) : null}
        />

        {/* Ready banner */}
        {readySignal && (
          <View style={styles.readyBanner}>
            <View style={styles.readyLeft}>
              <View style={styles.readyDot} />
              <View>
                <Text style={styles.readyTitle}>READY TO DISPATCH</Text>
                <Text style={styles.readySub} numberOfLines={1}>{readySignal.type} · {readySignal.locationLabel} · {readySignal.severity?.toUpperCase()}</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.5 }]} onPress={submitReport} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#000" size="small" /> : <Text style={styles.submitBtnText}>SUBMIT</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View style={styles.inputWrap}>
          <TouchableOpacity
            style={[styles.micBtn, isRecording && styles.micBtnActive]}
            onPress={isRecording ? stopRecording : startRecording}
            disabled={transcribing}
          >
            {isRecording ? <RecordingBars active={isRecording} /> : <Text style={styles.micIcon}>🎤</Text>}
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Describe the crisis or tap 🎤 to speak…"
            placeholderTextColor={COLORS.muted}
            multiline maxLength={500}
          />
          <TouchableOpacity style={[styles.sendBtn, (!input.trim() || loading) && { opacity: 0.4 }]} onPress={() => send()} disabled={!input.trim() || loading}>
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: COLORS.bg },
  header:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderColor: COLORS.border },
  headerIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.accent + '25', borderWidth: 1, borderColor: COLORS.accent + '50', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: COLORS.text, fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  headerSub:   { color: COLORS.muted, fontSize: 9, marginTop: 1 },
  liveBadge:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: COLORS.success + '50', backgroundColor: COLORS.success + '12' },
  liveDot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.success },
  liveText:    { color: COLORS.success, fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  langScroll:  { borderBottomWidth: 1, borderColor: COLORS.border, maxHeight: 44 },
  langContent: { paddingHorizontal: 14, paddingVertical: 8, gap: 6, flexDirection: 'row' },
  langChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  langChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '18' },
  langFlag:    { fontSize: 12 },
  langLabel:   { color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  langLabelActive: { color: COLORS.primary },
  quickScroll: { borderBottomWidth: 1, borderColor: COLORS.border, maxHeight: 42 },
  quickContent: { paddingHorizontal: 14, paddingVertical: 8, gap: 6, flexDirection: 'row' },
  quickChip:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: COLORS.accent + '50', backgroundColor: COLORS.accent + '12' },
  quickText:   { color: COLORS.accent, fontSize: 10, fontWeight: '700' },
  chatContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  bubbleRow:   { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end', gap: 8 },
  bubbleRowUser:  { justifyContent: 'flex-end' },
  bubbleRowModel: { justifyContent: 'flex-start' },
  aiAvatar:    { width: 30, height: 30, borderRadius: 10, backgroundColor: COLORS.accent + '25', borderWidth: 1, borderColor: COLORS.accent + '40', alignItems: 'center', justifyContent: 'center' },
  bubble:      { maxWidth: '78%', borderRadius: 16, padding: 12 },
  bubbleUser:  { backgroundColor: COLORS.secondary, borderBottomRightRadius: 4 },
  bubbleModel: { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, borderBottomLeftRadius: 4 },
  aiLabel:     { color: COLORS.accent, fontSize: 7, fontWeight: '900', letterSpacing: 1.5, marginBottom: 4 },
  voiceTag:    { color: COLORS.error, fontSize: 7, fontWeight: '900', marginBottom: 3 },
  bubbleTextUser:  { color: '#fff', fontSize: 13, lineHeight: 18 },
  bubbleTextModel: { color: COLORS.text, fontSize: 13, lineHeight: 18 },
  typing:      { paddingHorizontal: 14, marginBottom: 8 },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface2, borderRadius: 16, borderBottomLeftRadius: 4, padding: 12, alignSelf: 'flex-start', borderWidth: 1, borderColor: COLORS.border },
  typingText:  { color: COLORS.muted, fontSize: 11 },
  readyBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 14, marginBottom: 8, backgroundColor: COLORS.success + '15', borderRadius: 14, borderWidth: 1, borderColor: COLORS.success + '40', paddingHorizontal: 14, paddingVertical: 10 },
  readyLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  readyDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  readyTitle:  { color: COLORS.success, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  readySub:    { color: COLORS.muted, fontSize: 10, marginTop: 1 },
  submitBtn:   { backgroundColor: COLORS.success, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, marginLeft: 8 },
  submitBtnText: { color: '#000', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  inputWrap:   { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg },
  micBtn:      { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  micBtnActive: { backgroundColor: COLORS.error + '20', borderColor: COLORS.error },
  micIcon:     { fontSize: 18 },
  input:       { flex: 1, minHeight: 42, maxHeight: 100, backgroundColor: COLORS.surface2, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 10, color: COLORS.text, fontSize: 13 },
  sendBtn:     { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  sendIcon:    { color: '#fff', fontSize: 18, fontWeight: '900' },

  // Result card
  resultCard:  { marginHorizontal: 14, marginBottom: 8, backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.success + '40', padding: 16, gap: 12 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultCheck: { fontSize: 22 },
  resultTitle: { color: COLORS.success, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  resultId:    { color: COLORS.muted, fontSize: 9, marginTop: 2, fontFamily: 'monospace' },
  sevBadge:    { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  sevText:     { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  closeBtn:    { padding: 4 },
  closeBtnText: { color: COLORS.muted, fontSize: 14 },
  confRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  confLabel:   { fontSize: 9, fontWeight: '900', color: COLORS.muted, letterSpacing: 1 },
  confValue:   { fontSize: 18, fontWeight: '900' },
  bdRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bdLabel:     { fontSize: 9, fontWeight: '700', color: COLORS.muted, width: 90 },
  bdBarBg:     { flex: 1, height: 5, backgroundColor: COLORS.border, borderRadius: 99, overflow: 'hidden' },
  bdBarFill:   { height: 5, borderRadius: 99 },
  bdPct:       { fontSize: 9, fontWeight: '900', color: COLORS.text, width: 26, textAlign: 'right' },
  resourceRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  resChip:     { backgroundColor: COLORS.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.border },
  resChipText: { color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  agentPipeline: { gap: 6 },
  pipelineLabel: { fontSize: 8, fontWeight: '900', color: COLORS.muted, letterSpacing: 1.5 },
  agentDot:    { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pipelineArrow: {},
  pipelineArrowText: { color: COLORS.muted, fontSize: 10 },
  pipelineNote: { fontSize: 8, color: COLORS.dimmed, fontStyle: 'italic' },
});
