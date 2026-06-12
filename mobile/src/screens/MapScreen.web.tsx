import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../theme';

// Web fallback: react-native-maps is not supported on web.
// The full Google Maps experience is in the NEXUS web dashboard at localhost:3000.
export default function MapScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🗺️</Text>
      <Text style={styles.title}>Map View</Text>
      <Text style={styles.sub}>
        The interactive map with live incident markers is available in the{'\n'}
        <Text style={styles.highlight}>NEXUS Web Dashboard</Text>
        {'\n'}Open your browser at{' '}
        <Text style={styles.highlight}>http://localhost:3000</Text>
      </Text>
      <Text style={styles.note}>
        The full Android map (Google Maps + real-time overlays){'\n'}
        works when you open the app in Expo Go on your phone.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 16,
  },
  emoji:     { fontSize: 64 },
  title:     { fontSize: 22, fontWeight: '900', color: COLORS.text, textTransform: 'uppercase', letterSpacing: 2 },
  sub:       { fontSize: 14, color: COLORS.muted, textAlign: 'center', lineHeight: 22 },
  highlight: { color: COLORS.primary, fontWeight: '800' },
  note:      { fontSize: 11, color: COLORS.muted + '88', textAlign: 'center', lineHeight: 18, marginTop: 8 },
});
