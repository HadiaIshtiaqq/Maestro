import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

import { getStoredUser, saveSession, authApi } from './src/services/auth';
import { COLORS } from './src/theme';

// Screens
import WelcomeScreen        from './src/screens/WelcomeScreen';
import RegisterScreen       from './src/screens/RegisterScreen';
import LoginScreen          from './src/screens/LoginScreen';
import LocationSetupScreen  from './src/screens/LocationSetupScreen';
import EmergencyContactScreen from './src/screens/EmergencyContactScreen';
import DashboardScreen      from './src/screens/DashboardScreen';
import MapScreen            from './src/screens/MapScreen';
import ReportScreen         from './src/screens/ReportScreen';
import AICommandScreen      from './src/screens/AICommandScreen';
import ProfileScreen        from './src/screens/ProfileScreen';
import IncidentDetailScreen from './src/screens/IncidentDetailScreen';
import DispatchScreen       from './src/screens/DispatchScreen';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert:  true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: focused ? 22 : 18, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      id={undefined}
      screenOptions={{
        headerShown:     false,
        tabBarStyle:     { backgroundColor: COLORS.surface, borderTopColor: COLORS.border, paddingBottom: 6, height: 62 },
        tabBarActiveTintColor:   COLORS.primary,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarLabelStyle: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🚨" focused={focused} />, tabBarLabel: 'Crises' }}
      />
      <Tab.Screen name="Map" component={MapScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="🗺️" focused={focused} />, tabBarLabel: 'Map' }}
      />
      <Tab.Screen name="AICommand" component={AICommandScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="⚡" focused={focused} />, tabBarLabel: 'AI CMD' }}
      />
      <Tab.Screen name="Dispatch" component={DispatchScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="📟" focused={focused} />, tabBarLabel: 'Dispatch' }}
      />
      <Tab.Screen name="Report" component={ReportScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="📡" focused={focused} />, tabBarLabel: 'Report' }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />, tabBarLabel: 'Profile' }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [ready, setReady]       = useState(false);
  const [authed, setAuthed]     = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    (async () => {
      const user = await getStoredUser();
      if (user) {
        setAuthed(true);
        setNeedsSetup(!user.location?.lat);
      }
      // Register for push notifications — wrapped so any failure never blocks startup
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status === 'granted') {
          const projectId =
            Constants.expoConfig?.extra?.eas?.projectId ??
            (Constants as any).easConfig?.projectId;
          const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
          if (user) authApi.registerPushToken(token).catch(() => {});
        }
      } catch {}
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="light" backgroundColor={COLORS.bg} />
        <Stack.Navigator id={undefined} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.bg } }}>
          {!authed ? (
            <>
              <Stack.Screen name="Welcome"  component={WelcomeScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
              <Stack.Screen name="Login"    component={LoginScreen} />
            </>
          ) : needsSetup ? (
            <>
              <Stack.Screen name="LocationSetup"     component={LocationSetupScreen} />
              <Stack.Screen name="EmergencyContact"  component={EmergencyContactScreen} />
              <Stack.Screen name="Main"              component={MainTabs} />
            </>
          ) : (
            <>
              <Stack.Screen name="Main"             component={MainTabs} />
              <Stack.Screen name="IncidentDetail"   component={IncidentDetailScreen} />
              <Stack.Screen name="LocationSetup"    component={LocationSetupScreen} />
              <Stack.Screen name="EmergencyContact" component={EmergencyContactScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
