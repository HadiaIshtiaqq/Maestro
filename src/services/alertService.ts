import { User, IUser } from '../models/User';
import { IIncident } from '../models/index';
import { sendPushNotification, sendEmergencyContactAlert } from './notificationService';

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R  = 6371;
  const dL = ((lat2 - lat1) * Math.PI) / 180;
  const dG = ((lng2 - lng1) * Math.PI) / 180;
  const a  = Math.sin(dL / 2) ** 2 +
             Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
             Math.sin(dG / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function severityEmoji(s: string) {
  return s === 'critical' ? '🚨' : s === 'high' ? '⚠️' : s === 'medium' ? '🔔' : 'ℹ️';
}

export async function notifyUsersNearIncident(incident: IIncident): Promise<void> {
  try {
    // Enterprise incidents are region-based and carry no coordinates —
    // proximity alerts only apply to geolocated (civic/mobile) incidents.
    if (!incident.location) return;

    const { lat, lng } = incident.location;
    const allUsers = await User.find({});
    const affected: IUser[] = [];

    for (const user of allUsers) {
      const dist = haversine(
        user.location.lat, user.location.lng,
        lat, lng,
      );
      if (dist <= user.alertRadiusKm) affected.push(user);
    }

    if (!affected.length) {
      console.log(`[Alert] No users within radius of ${incident.incidentId}`);
      return;
    }
    console.log(`[Alert] Notifying ${affected.length} users near ${incident.incidentId}`);

    const title = `${severityEmoji(incident.severity)} ${incident.type} Alert`;
    const body  = `${incident.severity.toUpperCase()} confirmed near you — ${Math.round(incident.confidence * 100)}% confidence`;
    const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

    // Push notifications to all affected users
    await Promise.allSettled(
      affected
        .filter(u => u.pushToken)
        .map(u => sendPushNotification({
          to:    u.pushToken!,
          title,
          body,
          data:  { incidentId: incident.incidentId },
        })),
    );

    // WhatsApp + Email to emergency contacts for high/critical
    if (incident.severity === 'critical' || incident.severity === 'high') {
      await Promise.allSettled(
        affected
          .filter(u => u.emergencyContact)
          .map(u => sendEmergencyContactAlert({
            userName:         u.name,
            userPhone:        u.phone,
            contactPhone:     u.emergencyContact!.phone,
            contactEmail:     u.emergencyContact!.email || undefined,
            contactName:      u.emergencyContact!.name,
            useWhatsapp:      u.emergencyContact!.notifyViaWhatsapp,
            useEmail:         u.emergencyContact!.notifyViaEmail !== false,
            incidentType:     incident.type,
            incidentLocation: u.location.address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
            severity:         incident.severity,
            mapsUrl,
          })),
      );
    }
  } catch (err: any) {
    console.error('[Alert] Error:', err.message);
  }
}

export async function getIncidentsNearUser(
  lat: number, lng: number, radiusKm: number, incidents: IIncident[],
): Promise<IIncident[]> {
  return incidents.filter(
    inc => inc.location != null && haversine(lat, lng, inc.location.lat, inc.location.lng) <= radiusKm,
  );
}
