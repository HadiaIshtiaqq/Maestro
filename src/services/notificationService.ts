/**
 * Maestro Notification Service
 * Sends via WhatsApp Cloud API (Meta) + Gmail SMTP simultaneously.
 * Both work in Pakistan. Both have free tiers.
 */

import nodemailer from 'nodemailer';

// ─── WhatsApp Cloud API (Meta) ────────────────────────────────────────────────

async function sendWhatsApp(to: string, message: string): Promise<boolean> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.warn('[WA] Not configured — set WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN');
    return false;
  }

  // Normalize to international format without +
  const digits = to.replace(/\D/g, '');
  const intl   = digits.startsWith('92') ? digits : digits.startsWith('0') ? `92${digits.slice(1)}` : `92${digits}`;

  try {
    const res  = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:                intl,
        type:              'text',
        text:              { body: message },
      }),
    });
    const data = await res.json() as any;
    if (!res.ok) { console.error('[WA] Error:', data?.error?.message); return false; }
    console.log(`[WA] Sent → +${intl} | id: ${data.messages?.[0]?.id}`);
    return true;
  } catch (e: any) {
    console.error('[WA] Fetch error:', e.message);
    return false;
  }
}

// ─── Gmail SMTP (Nodemailer) ──────────────────────────────────────────────────

let _transport: nodemailer.Transporter | null = null;

function getTransport() {
  if (_transport) return _transport;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  _transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  return _transport;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const transport = getTransport();
  const from      = process.env.GMAIL_USER;
  if (!transport || !from || !to) {
    if (!transport) console.warn('[Mail] Not configured — set GMAIL_USER + GMAIL_APP_PASSWORD');
    return false;
  }
  try {
    const info = await transport.sendMail({ from: `Maestro Crisis System <${from}>`, to, subject, html });
    console.log(`[Mail] Sent → ${to} | ${info.messageId}`);
    return true;
  } catch (e: any) {
    console.error('[Mail] Error:', e.message);
    return false;
  }
}

// ─── HTML email template ──────────────────────────────────────────────────────

function buildEmailHtml(opts: {
  title: string;
  badge: string;
  badgeColor: string;
  lines: { label: string; value: string }[];
  footer: string;
  mapsUrl?: string;
}) {
  const rows = opts.lines.map(l => `
    <tr>
      <td style="padding:6px 0;color:#9ca3af;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;width:120px">${l.label}</td>
      <td style="padding:6px 0;color:#f1f5f9;font-size:13px;font-weight:600">${l.value}</td>
    </tr>`).join('');

  const mapsBtn = opts.mapsUrl ? `
    <a href="${opts.mapsUrl}" style="display:inline-block;margin-top:20px;background:#00e5ff;color:#000;padding:10px 20px;border-radius:8px;font-weight:900;font-size:12px;text-decoration:none;text-transform:uppercase;letter-spacing:1px">
      📍 Open in Google Maps
    </a>` : '';

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0c10;font-family:system-ui,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">
    <div style="background:#12161e;border:1px solid #1e2530;border-radius:16px;overflow:hidden">
      <div style="background:${opts.badgeColor}18;border-bottom:1px solid ${opts.badgeColor}30;padding:20px 24px">
        <span style="background:${opts.badgeColor};color:#000;font-size:10px;font-weight:900;padding:3px 10px;border-radius:99px;text-transform:uppercase;letter-spacing:1px">${opts.badge}</span>
        <h1 style="margin:12px 0 0;color:#f1f5f9;font-size:20px;font-weight:900">${opts.title}</h1>
      </div>
      <div style="padding:24px">
        <table style="width:100%;border-collapse:collapse">${rows}</table>
        ${mapsBtn}
      </div>
      <div style="padding:16px 24px;border-top:1px solid #1e2530;color:#4b5563;font-size:11px">${opts.footer}</div>
    </div>
    <p style="text-align:center;color:#374151;font-size:10px;margin-top:16px">Maestro · Crisis Intelligence & Response Orchestrator · Antigravity AI</p>
  </div>
</body></html>`;
}

// ─── Expo Push Notifications ──────────────────────────────────────────────────

export interface PushPayload {
  to: string; title: string; body: string; data?: Record<string, any>;
}

export async function sendPushNotification(payload: PushPayload): Promise<void> {
  if (!payload.to?.startsWith('ExponentPushToken')) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: payload.to, title: payload.title, body: payload.body, data: payload.data ?? {}, sound: 'default', priority: 'high', badge: 1 }),
    });
    console.log(`[Push] Sent → ${payload.to.slice(0, 30)}…`);
  } catch (e: any) { console.error('[Push] Error:', e.message); }
}

// ─── Emergency Contact Alert ──────────────────────────────────────────────────

export interface EmergencyAlertPayload {
  userName:         string;
  userPhone:        string;
  contactPhone:     string;
  contactEmail?:    string;
  contactName:      string;
  useWhatsapp:      boolean;
  useEmail:         boolean;
  incidentType:     string;
  incidentLocation: string;
  severity:         string;
  isSos?:           boolean;
  mapsUrl?:         string;
}

export async function sendEmergencyContactAlert(p: EmergencyAlertPayload) {
  const emoji  = p.severity === 'critical' ? '🚨🚨🚨' : p.severity === 'high' ? '🚨' : '⚠️';
  const prefix = p.isSos ? `🆘 SOS from ${p.userName}` : `${emoji} Maestro Crisis Alert`;
  const badgeColor = p.severity === 'critical' ? '#ef4444' : p.severity === 'high' ? '#f59e0b' : '#3b82f6';

  const whatsappText = p.isSos
    ? `${prefix}\n\n${p.userName} (${p.userPhone}) triggered an SOS.\n📍 Location: ${p.incidentLocation}\n⚠️ Incident: ${p.incidentType}\n🔴 Severity: ${p.severity.toUpperCase()}\n\nAct immediately. — Maestro Crisis System`
    : `${prefix}\n\n${p.userName} is in an affected area.\n📍 Location: ${p.incidentLocation}\n⚠️ Incident: ${p.incidentType}\n🔴 Severity: ${p.severity.toUpperCase()}\n\nStay safe. — Maestro Crisis System`;

  const emailSubject = p.isSos ? `🆘 SOS Alert — ${p.userName}` : `${emoji} Crisis Alert for ${p.userName} | ${p.incidentType}`;
  const emailHtml = buildEmailHtml({
    title:      p.isSos ? `SOS Alert from ${p.userName}` : `Crisis Alert — ${p.incidentType}`,
    badge:      p.isSos ? 'SOS' : p.severity.toUpperCase(),
    badgeColor,
    lines: [
      { label: 'Person',   value: `${p.userName} (${p.userPhone})` },
      { label: 'Incident', value: p.incidentType },
      { label: 'Severity', value: p.severity.toUpperCase() },
      { label: 'Location', value: p.incidentLocation },
    ],
    footer:  p.isSos ? 'Respond immediately. This is an automated SOS from Maestro.' : 'Automated alert from Maestro Crisis Orchestrator. AI-verified incident.',
    mapsUrl: p.mapsUrl,
  });

  const results = await Promise.allSettled([
    p.useWhatsapp ? sendWhatsApp(p.contactPhone, whatsappText) : Promise.resolve(false),
    p.useEmail && p.contactEmail ? sendEmail(p.contactEmail, emailSubject, emailHtml) : Promise.resolve(false),
  ]);

  const waOk    = (results[0] as PromiseFulfilledResult<boolean>)?.value;
  const emailOk = (results[1] as PromiseFulfilledResult<boolean>)?.value;
  return { sent: waOk || emailOk, whatsapp: waOk, email: emailOk };
}

// ─── Dispatch Alert (Ambulance / Police / Fire) ───────────────────────────────

export interface DispatchPayload {
  service:      'ambulance' | 'police' | 'fire';
  phone:        string;
  email?:       string;
  incidentId:   string;
  incidentType: string;
  location:     { lat: number; lng: number };
  severity:     string;
  unitsNeeded:  number;
}

export async function sendDispatchAlert(p: DispatchPayload) {
  const emoji  = p.service === 'ambulance' ? '🚑' : p.service === 'police' ? '🚔' : '🚒';
  const mapsUrl = `https://maps.google.com/?q=${p.location.lat},${p.location.lng}`;
  const waText  = `${emoji} Maestro DISPATCH — ${p.service.toUpperCase()}\n\nIncident: ${p.incidentType}\nSeverity: ${p.severity.toUpperCase()}\nUnits needed: ${p.unitsNeeded}\n📍 ${mapsUrl}\nRef: ${p.incidentId.slice(0, 8)}\n\nRespond immediately. Maestro Crisis System.`;

  const emailHtml = buildEmailHtml({
    title:      `Dispatch Order — ${p.service.toUpperCase()}`,
    badge:      'DISPATCH',
    badgeColor: '#00e5ff',
    lines: [
      { label: 'Service',  value: `${emoji} ${p.service.toUpperCase()}` },
      { label: 'Incident', value: p.incidentType },
      { label: 'Severity', value: p.severity.toUpperCase() },
      { label: 'Units',    value: String(p.unitsNeeded) },
      { label: 'Ref',      value: p.incidentId.slice(0, 8) },
    ],
    footer:  'Automated dispatch from Maestro Crisis Orchestrator.',
    mapsUrl,
  });

  const results = await Promise.allSettled([
    p.phone ? sendWhatsApp(p.phone, waText) : Promise.resolve(false),
    p.email ? sendEmail(p.email, `${emoji} Maestro Dispatch — ${p.service}`, emailHtml) : Promise.resolve(false),
  ]);

  return {
    sent:     true,
    whatsapp: (results[0] as PromiseFulfilledResult<boolean>)?.value,
    email:    (results[1] as PromiseFulfilledResult<boolean>)?.value,
  };
}
