import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from './api';

const TOKEN_KEY  = 'ciro_token';
const USER_KEY   = 'ciro_user';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function saveSession(token: string, user: any) {
  await AsyncStorage.multiSet([[TOKEN_KEY, token], [USER_KEY, JSON.stringify(user)]]);
}

export async function getStoredUser(): Promise<any | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function clearSession() {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

async function authReq<T>(path: string, options: RequestInit): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export const authApi = {
  register: (body: { name: string; phone: string; password: string; location: { lat: number; lng: number; address: string } }) =>
    authReq<{ token: string; user: any }>('/api/users/register', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { phone: string; password: string }) =>
    authReq<{ token: string; user: any }>('/api/users/login', { method: 'POST', body: JSON.stringify(body) }),

  getMe: () =>
    authReq<any>('/api/users/me', { method: 'GET' }),

  updateLocation: (lat: number, lng: number, address: string) =>
    authReq<any>('/api/users/location', { method: 'PUT', body: JSON.stringify({ lat, lng, address }) }),

  updateEmergencyContact: (contact: { name: string; phone: string; email?: string; relationship: string; notifyViaWhatsapp: boolean; notifyViaEmail: boolean }) =>
    authReq<any>('/api/users/emergency-contact', { method: 'PUT', body: JSON.stringify(contact) }),

  updateAlertRadius: (radiusKm: number) =>
    authReq<any>('/api/users/alert-radius', { method: 'PUT', body: JSON.stringify({ radiusKm }) }),

  registerPushToken: (pushToken: string) =>
    authReq<any>('/api/users/push-token', { method: 'PUT', body: JSON.stringify({ pushToken }) }),

  triggerSos: (incidentType: string, severity: string) =>
    authReq<any>('/api/users/sos', { method: 'POST', body: JSON.stringify({ incidentType, severity }) }),

  getNearbyIncidents: () =>
    authReq<any>('/api/users/nearby-incidents', { method: 'GET' }),
};
