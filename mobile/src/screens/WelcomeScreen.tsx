import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  Animated, Easing, Dimensions,
} from 'react-native';
import { COLORS } from '../theme';

const { width } = Dimensions.get('window');

export default function WelcomeScreen({ navigation }: any) {
  const pulseScale  = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.4)).current;
  const logoOpacity  = useRef(new Animated.Value(0)).current;
  const logoTranslateY = useRef(new Animated.Value(-30)).current;
  const titleOpacity  = useRef(new Animated.Value(0)).current;
  const featureAnims  = [0,1,2,3].map(() => ({
    opacity:    useRef(new Animated.Value(0)).current,
    translateX: useRef(new Animated.Value(-40)).current,
  }));
  const btnOpacity = useRef(new Animated.Value(0)).current;
  const btnTranslateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    // Pulse ring loop
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale,   { toValue: 1.25, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0,    duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale,   { toValue: 1,    duration: 0,    useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.4,  duration: 0,    useNativeDriver: true }),
        ]),
      ])
    ).start();

    // Entrance sequence
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity,     { toValue: 1,  duration: 600, useNativeDriver: true }),
        Animated.timing(logoTranslateY,  { toValue: 0,  duration: 600, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
      ]),
      Animated.timing(titleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.stagger(120,
        featureAnims.map(a =>
          Animated.parallel([
            Animated.timing(a.opacity,    { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(a.translateX, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ])
        )
      ),
      Animated.parallel([
        Animated.timing(btnOpacity,     { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(btnTranslateY,  { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const features: [string, string][] = [
    ['🌍', 'Location-aware alerts in your area'],
    ['🤖', 'AI agent confirms every incident'],
    ['🚑', 'Auto-dispatches ambulance & police'],
    ['📲', 'Notifies your emergency contact'],
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Hero */}
        <Animated.View style={[styles.hero, { opacity: logoOpacity, transform: [{ translateY: logoTranslateY }] }]}>
          <View style={styles.logoWrap}>
            <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
            <View style={styles.logoRing}>
              <Text style={styles.logoEmoji}>🛰️</Text>
            </View>
          </View>
          <Animated.Text style={[styles.appName, { opacity: titleOpacity }]}>NEXUS</Animated.Text>
          <Animated.Text style={[styles.tagline, { opacity: titleOpacity }]}>
            Crisis Intelligence{'\n'}& Response Network
          </Animated.Text>
          <Animated.Text style={[styles.sub, { opacity: titleOpacity }]}>
            AI-powered crisis detection · Real-time alerts{'\n'}
            Emergency coordination · Safe routing
          </Animated.Text>
        </Animated.View>

        {/* Features */}
        <View style={styles.features}>
          {features.map(([emoji, label], i) => (
            <Animated.View
              key={label}
              style={[
                styles.feature,
                {
                  opacity:   featureAnims[i].opacity,
                  transform: [{ translateX: featureAnims[i].translateX }],
                },
              ]}
            >
              <Text style={styles.featureEmoji}>{emoji}</Text>
              <Text style={styles.featureText}>{label}</Text>
            </Animated.View>
          ))}
        </View>

        {/* Buttons */}
        <Animated.View style={[styles.buttons, { opacity: btnOpacity, transform: [{ translateY: btnTranslateY }] }]}>
          <TouchableOpacity style={styles.primary} onPress={() => navigation.navigate('Register')} activeOpacity={0.85}>
            <Text style={styles.primaryText}>Create Account</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={() => navigation.navigate('Login')} activeOpacity={0.85}>
            <Text style={styles.secondaryText}>Sign In</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, paddingHorizontal: 28, paddingBottom: 40, justifyContent: 'space-between' },
  hero:      { alignItems: 'center', paddingTop: 60, gap: 16 },
  logoWrap:  { width: 110, height: 110, alignItems: 'center', justifyContent: 'center' },
  pulseRing: {
    position: 'absolute',
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 2, borderColor: COLORS.primary,
  },
  logoRing:  {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: COLORS.primary + '18',
    borderWidth: 2, borderColor: COLORS.primary + '50',
    alignItems: 'center', justifyContent: 'center',
  },
  logoEmoji: { fontSize: 44 },
  appName:   { fontSize: 42, fontWeight: '900', color: COLORS.primary, letterSpacing: 4 },
  tagline:   { fontSize: 18, fontWeight: '800', color: COLORS.text, textAlign: 'center', lineHeight: 26 },
  sub:       { fontSize: 12, color: COLORS.muted, textAlign: 'center', lineHeight: 20, fontWeight: '600' },
  features:  { gap: 12 },
  feature:   {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.surface, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  featureEmoji: { fontSize: 22 },
  featureText:  { fontSize: 13, color: COLORS.text, fontWeight: '700', flex: 1 },
  buttons:   { gap: 12 },
  primary:   { backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  primaryText: { color: '#000', fontSize: 15, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 },
  secondary:   { borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  secondaryText: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
});
