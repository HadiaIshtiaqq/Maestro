import dotenv from 'dotenv';
import { randomBytes } from 'crypto';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ciro',
    dnsServers: process.env.DNS_SERVERS?.split(',').map((item) => item.trim()).filter(Boolean) ?? [],
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  dnsServers: process.env.DNS_SERVERS?.split(',').map((item) => item.trim()).filter(Boolean) ?? [],
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
  },
  jwtSecret: resolveJwtSecret(),
};

// No hardcoded fallback: in production a missing JWT_SECRET is a fatal misconfig;
// in development we generate a random per-boot secret (tokens reset on restart).
function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if ((process.env.NODE_ENV || 'development') === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }
  console.warn('[Config] JWT_SECRET not set — using a random per-boot secret (dev only)');
  return randomBytes(32).toString('hex');
}
