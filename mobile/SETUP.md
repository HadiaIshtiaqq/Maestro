# NEXUS Mobile App — Setup Guide

## Prerequisites
- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- Expo Go app on your phone (iOS/Android) for testing

## Quick Start

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go to run on your device.

## Environment / Keys

### Google Maps
Add your own Google Maps API key under `ios.config.googleMapsApiKey` and
`android.config.googleMaps.apiKey` in `app.json` — restrict it to this app's
bundle ID / package name in Google Cloud Console.
Make sure the following APIs are enabled in Google Cloud Console:
- Maps SDK for Android
- Maps SDK for iOS

### Backend URL
Edit `src/services/api.ts` → `BASE_URL`:
- **Dev (same machine):** `http://localhost:3000`
- **Dev (physical device on LAN):** `http://192.168.x.x:3000` (find your IP with `ipconfig`)
- **Production:** Your deployed backend URL

### Twilio (SMS + WhatsApp)
Add to the backend `.env`:
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+12025550100
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```
Get credentials at: https://console.twilio.com
Enable WhatsApp sandbox at: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn

## App Flow

```
Welcome
  ├── Register → LocationSetup → EmergencyContact → Main
  └── Login → Main

Main (Bottom Tabs)
  ├── 🚨 Crises — Location-filtered incident feed (real-time via Socket.IO)
  ├── 🗺️ Map    — Google Maps with incident markers, hospitals, routes
  ├── 📡 Report — Text + voice incident reporting + SOS button
  └── 👤 Profile — Location, emergency contact, alert radius
```

## Key Features

| Feature | Implementation |
|---------|---------------|
| Location-based alerts | Users only see incidents within `alertRadiusKm` |
| Voice reporting | `expo-av` Audio.Recording → backend `/api/ingest-signal` |
| Auto language detection | Client-side Roman Urdu / Urdu regex patterns |
| AI verification | Gemini 2.0 Flash agents: social + weather + maps confidence |
| Emergency contact SMS | Twilio SMS/WhatsApp via `/api/users/sos` |
| Dispatch services | Automated SMS to ambulance/police/fire |
| Alternative routes | Shown on map via `infrastructureRecommendations` |
| Push notifications | Expo push tokens + `exp.host` API |

## Building for Production

```bash
# Install EAS CLI
npm install -g eas-cli

# Login and configure
eas login
eas build:configure

# Build APK (Android)
eas build --platform android --profile preview

# Build for iOS
eas build --platform ios
```
