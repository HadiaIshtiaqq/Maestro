import { z } from "zod";

export const IngestSignalSchema = z.object({
  source:   z.string().min(1).max(50).default("social"),
  type:     z.string().min(1).max(200),
  data:     z.record(z.string(), z.unknown()).default({}),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
  urgency:  z.number().min(0).max(10).optional(),
  async:    z.boolean().optional(),
}).strict();

export const VerifyIncidentSchema = z.object({
  incidentId:  z.string().min(1),
  status:      z.string().min(1),
  fieldReport: z.string().optional(),
}).strict();

export const DispatchLogSchema = z.object({
  incidentId: z.string().min(1),
  service:    z.enum(["ambulance", "police", "fire", "drone", "other"]),
  message:    z.string().min(1).max(5000),
  sentBy:     z.string().max(100).optional(),
  channel:    z.enum(["sms", "whatsapp", "email", "push", "manual"]).optional(),
}).strict();

export const ChatIncidentSchema = z.object({
  messages: z.array(z.object({
    role:    z.enum(["user", "model"]),
    content: z.string().min(1).max(10000),
  })).min(1).max(50),
}).strict();

export const OperatorTakeoverSchema = z.object({
  incidentId: z.string().min(1),
  operatorId: z.string().max(100).optional(),
}).strict();

export const OperatorResolveSchema = z.object({
  incidentId: z.string().min(1),
  notes:      z.string().max(5000).optional(),
  operatorId: z.string().max(100).optional(),
}).strict();

export const OperatorNotesSchema = z.object({
  incidentId: z.string().min(1),
  note:       z.string().min(1).max(5000),
  operatorId: z.string().max(100).optional(),
}).strict();

export const OperatorEscalateSchema = z.object({
  incidentId: z.string().min(1),
  severity:   z.enum(["low", "medium", "high", "critical"]).optional(),
  status:     z.string().max(50).optional(),
  reason:     z.string().max(2000).optional(),
  operatorId: z.string().max(100).optional(),
}).strict();

export const OperatorBulkCloseSchema = z.object({
  incidentIds: z.array(z.string().min(1)).min(1).max(100),
  reason:      z.string().max(2000).optional(),
  operatorId:  z.string().max(100).optional(),
}).strict();

export const BandDecisionSchema = z.object({
  proposalMsgId: z.string().min(1),
  approverId:    z.string().max(100).optional(),
  notes:         z.string().max(2000).optional(),
}).strict();

export const VoiceTranscribeSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType:    z.string().regex(/^audio\//).default("audio/mp4"),
}).strict();

export const SignalSourceSchema = z.object({
  type:     z.string().min(1).max(200),
  data:     z.record(z.string(), z.unknown()).optional(),
  location: z.object({ lat: z.number(), lng: z.number() }).optional(),
  urgency:  z.number().min(0).max(10).optional(),
}).strict();
