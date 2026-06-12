import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { notifyUsersNearIncident } from '../services/alertService';
import { sendEmergencyContactAlert, sendDispatchAlert } from '../services/notificationService';
import { IncidentService } from '../services/incidentService';
import { eventBus } from '../events/eventBus';

import { config } from '../config/index';

const router = Router();
const JWT_SECRET = config.jwtSecret;

function makeToken(userId: string) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '30d' });
}

function authMiddleware(req: any, res: any, next: any) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET) as any;
    req.userId = decoded.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Register ──────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, phone, password, location } = req.body;
    if (!name || !phone || !password || !location?.lat || !location?.lng) {
      return res.status(400).json({ error: 'name, phone, password and location are required' });
    }
    const existing = await User.findOne({ phone });
    if (existing) return res.status(409).json({ error: 'Phone number already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name, phone, passwordHash,
      location: { lat: location.lat, lng: location.lng, address: location.address ?? '' },
      alertRadiusKm: 15,
    });

    res.status(201).json({ token: makeToken(user.id), user: safeUser(user) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: makeToken(user.id), user: safeUser(user) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get profile ───────────────────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req: any, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(safeUser(user));
});

// ── Update location ───────────────────────────────────────────────────────────
router.put('/location', authMiddleware, async (req: any, res) => {
  try {
    const { lat, lng, address } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });
    const user = await User.findByIdAndUpdate(
      req.userId,
      { location: { lat, lng, address: address ?? '' } },
      { new: true },
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    eventBus.emit('user:locationUpdated', { userId: user.id, location: user.location });
    res.json(safeUser(user));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update emergency contact ──────────────────────────────────────────────────
router.put('/emergency-contact', authMiddleware, async (req: any, res) => {
  try {
    const { name, phone, email, relationship, notifyViaWhatsapp, notifyViaEmail } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        emergencyContact: {
          name,
          phone,
          email:             email ?? '',
          relationship:      relationship ?? 'Other',
          notifyViaWhatsapp: notifyViaWhatsapp ?? true,
          notifyViaEmail:    notifyViaEmail ?? true,
        },
      },
      { new: true },
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(safeUser(user));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update alert radius ───────────────────────────────────────────────────────
router.put('/alert-radius', authMiddleware, async (req: any, res) => {
  try {
    const { radiusKm } = req.body;
    const user = await User.findByIdAndUpdate(req.userId, { alertRadiusKm: radiusKm }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(safeUser(user));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Register push token (Expo) ────────────────────────────────────────────────
router.put('/push-token', authMiddleware, async (req: any, res) => {
  try {
    const { pushToken } = req.body;
    await User.findByIdAndUpdate(req.userId, { pushToken });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── SOS — notify emergency contact immediately ────────────────────────────────
router.post('/sos', authMiddleware, async (req: any, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.emergencyContact) return res.status(400).json({ error: 'No emergency contact registered' });

    const mapsUrl = `https://maps.google.com/?q=${user.location.lat},${user.location.lng}`;
    const result  = await sendEmergencyContactAlert({
      userName:         user.name,
      userPhone:        user.phone,
      contactPhone:     user.emergencyContact.phone,
      contactEmail:     user.emergencyContact.email || undefined,
      contactName:      user.emergencyContact.name,
      useWhatsapp:      user.emergencyContact.notifyViaWhatsapp,
      useEmail:         user.emergencyContact.notifyViaEmail !== false,
      incidentType:     req.body.incidentType ?? 'Unknown Emergency',
      incidentLocation: user.location.address || `${user.location.lat.toFixed(4)}, ${user.location.lng.toFixed(4)}`,
      severity:         req.body.severity ?? 'critical',
      isSos:            true,
      mapsUrl,
    });

    eventBus.emit('user:sos', { userId: user.id, location: user.location });
    res.json({ sent: result.sent, whatsapp: result.whatsapp, email: result.email });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Nearby incidents for user ─────────────────────────────────────────────────
router.get('/nearby-incidents', authMiddleware, async (req: any, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { incidents } = await IncidentService.getActiveCrisesWithResources();
    const { getIncidentsNearUser } = await import('../services/alertService');
    const nearby = await getIncidentsNearUser(
      user.location.lat, user.location.lng, user.alertRadiusKm, incidents as any,
    );
    res.json({ incidents: nearby, userLocation: user.location, alertRadiusKm: user.alertRadiusKm });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dispatch services (ambulance / police / fire) ─────────────────────────────
router.post('/dispatch', authMiddleware, async (req: any, res) => {
  try {
    const { service, phone, incidentId, incidentType, location, severity, unitsNeeded } = req.body;
    const result = await sendDispatchAlert({ service, phone, incidentId, incidentType, location, severity, unitsNeeded });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dev: delete user by phone (for testing; never registered in production) ──
if (config.env === 'development') {
  router.delete('/dev-reset/:phone', async (req, res) => {
    try {
      const result = await User.deleteOne({ phone: decodeURIComponent(req.params.phone) });
      res.json({ deleted: result.deletedCount });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}

function safeUser(u: any) {
  const { passwordHash, __v, ...rest } = u.toObject ? u.toObject() : u;
  return rest;
}

export default router;
