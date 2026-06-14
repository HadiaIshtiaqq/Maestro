import mongoose, { Schema, Document } from 'mongoose';

// ─── BandRoom ─────────────────────────────────────────────────────────────────
// Mirror of Band's per-incident room. One room per incident; used for local
// querying and the operator view. Band's own trail is the source of truth.

export interface IBandRoom extends Document {
  room_id:      string;
  incident_id:  string;
  participants: string[];
  status:       'open' | 'closed';
  created_at:   Date;
  closed_at?:   Date;
}

const BandRoomSchema = new Schema<IBandRoom>({
  room_id:      { type: String, required: true, unique: true },
  incident_id:  { type: String, required: true, index: true },
  participants: [{ type: String }],
  status:       { type: String, enum: ['open', 'closed'], default: 'open' },
  created_at:   { type: Date, default: Date.now },
  closed_at:    { type: Date },
});

export const BandRoom: mongoose.Model<IBandRoom> =
  (mongoose.models['BandRoom'] as mongoose.Model<IBandRoom>) ??
  mongoose.model<IBandRoom>('BandRoom', BandRoomSchema);

// ─── AgentMessage ─────────────────────────────────────────────────────────────
// Local read-model mirror of Band's audit trail. Every message posted to a
// Band room is mirrored here for the operator view and compliance export.

export type MsgTypeDB =
  | 'finding' | 'proposal' | 'approval_request'
  | 'approval' | 'retraction' | 'status';

export interface IAgentMessage extends Document {
  id:                      string;
  room_id:                 string;
  incident_id:             string;
  msg_type:                MsgTypeDB;
  from_agent:              string;
  step:                    string;
  payload:                 any;
  confidence:              number;
  requires_human_approval: boolean;
  engine?:                 string;
  prev_hash?:              string;
  hash?:                   string;
  ts:                      Date;
}

const AgentMessageSchema = new Schema<IAgentMessage>({
  id:                      { type: String, required: true, unique: true },
  room_id:                 { type: String, required: true, index: true },
  incident_id:             { type: String, required: true, index: true },
  msg_type:                { type: String, required: true },
  from_agent:              { type: String, required: true },
  step:                    { type: String },
  payload:                 { type: Schema.Types.Mixed },
  confidence:              { type: Number, default: 0 },
  requires_human_approval: { type: Boolean, default: false },
  engine:                  { type: String },
  prev_hash:               { type: String },
  hash:                    { type: String },
  ts:                      { type: Date, default: Date.now },
}, { timestamps: false });

export const AgentMessage: mongoose.Model<IAgentMessage> =
  (mongoose.models['AgentMessage'] as mongoose.Model<IAgentMessage>) ??
  mongoose.model<IAgentMessage>('AgentMessage', AgentMessageSchema);

// ─── Approval ─────────────────────────────────────────────────────────────────
// Human Commander approvals/vetoes. These ARE the regulatory artifact for
// every high-stakes action; no approval = action cannot proceed.

export interface IApproval extends Document {
  approval_id:  string;
  room_id:      string;
  incident_id:  string;
  proposal_id:  string;
  approver_id:  string;
  decision:     'approved' | 'vetoed';
  notes?:       string;
  ts:           Date;
}

const ApprovalSchema = new Schema<IApproval>({
  approval_id:  { type: String, required: true, unique: true },
  room_id:      { type: String, required: true, index: true },
  incident_id:  { type: String, required: true, index: true },
  proposal_id:  { type: String, required: true, index: true },
  approver_id:  { type: String, required: true },
  decision:     { type: String, enum: ['approved', 'vetoed'], required: true },
  notes:        { type: String },
  ts:           { type: Date, default: Date.now },
});

export const Approval: mongoose.Model<IApproval> =
  (mongoose.models['Approval'] as mongoose.Model<IApproval>) ??
  mongoose.model<IApproval>('Approval', ApprovalSchema);

// ─── Responder ────────────────────────────────────────────────────────────────

export interface IResponder extends Document {
  name:                 string;
  role:                 'SRE' | 'SecEng' | 'DataEng' | 'IC' | 'ComplianceOfficer';
  skills:               string[];
  onCall:               boolean;
  assignedIncidentId?:  string;
}

const ResponderSchema = new Schema<IResponder>({
  name:                { type: String, required: true },
  role:                { type: String, required: true },
  skills:              [{ type: String }],
  onCall:              { type: Boolean, default: false },
  assignedIncidentId:  { type: String, default: null },
}, { timestamps: true });

export const Responder: mongoose.Model<IResponder> =
  (mongoose.models['Responder'] as mongoose.Model<IResponder>) ??
  mongoose.model<IResponder>('Responder', ResponderSchema);

// ─── Signal ───────────────────────────────────────────────────────────────────

export interface ISignal extends Document {
  source: 'social' | 'weather' | 'traffic' | 'sensor' | 'call' | 'field'
        | 'siem' | 'monitoring' | 'ticket' | 'human' | 'field_officer';
  type: string;
  data: any;
  location?: { lat: number; lng: number };
  urgency: number;
  credibilityScore?: number;
  conflictFlags?: Array<{
    type: string;
    description: string;
    suggestedResolution: string;
  }>;
  // Language detection fields
  detectedLanguage?: string;
  originalText?: string;
  normalizedText?: string;
  isRomanUrdu?: boolean;
  languageConfidence?: number;
  timestamp: Date;
}

const SignalSchema: Schema = new Schema({
  source:           { type: String, required: true },
  type:             { type: String, required: true },
  data:             { type: Schema.Types.Mixed },
  location:         { lat: Number, lng: Number },
  urgency:          { type: Number, default: 0 },
  credibilityScore: { type: Number },
  conflictFlags:    [{
    type:                { type: String },
    description:         { type: String },
    suggestedResolution: { type: String },
  }],
  detectedLanguage:  { type: String },
  originalText:      { type: String },
  normalizedText:    { type: String },
  isRomanUrdu:       { type: Boolean, default: false },
  languageConfidence:{ type: Number },
  timestamp: { type: Date, default: Date.now },
});

export const Signal: mongoose.Model<ISignal> =
  (mongoose.models['Signal'] as mongoose.Model<ISignal>) ??
  mongoose.model<ISignal>('Signal', SignalSchema);

// ─── Incident ─────────────────────────────────────────────────────────────────

export interface ITraceStep {
  step:       string;
  agent:      string;
  decision:   string;
  reason:     string;
  confidence?: number;
  timestamp:  number;
}

export interface IIncident extends Document {
  incidentId:  string;
  roomId?:     string;    // Band room for this incident
  type:        string;
  subType?:    string;
  severity:    'low' | 'medium' | 'high' | 'critical';
  sevLevel?:   'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4' | 'SEV-5';
  status:      'detected' | 'analyzing' | 'active' | 'contained' | 'resolving' | 'closed' | 'retracted' | 'unverified';
  location?:   { lat: number; lng: number };
  radius:      number;
  confidence:  number;
  signals:     mongoose.Types.ObjectId[];
  // Enterprise blast radius
  blastRadius?: {
    estimatedCustomersAffected: number;
    estimatedServicesAffected:  number;
    affectedServiceList:        string[];
    cascadeRisk:                string;
  };
  // SLA breach tracking
  slaBreachRisk?: {
    breachImminentIn:                 string;
    regulatoryNotificationRequired:   boolean;
    notificationDeadline?:            string;
  };
  // Responder assignments
  responderAssignments?: Array<{
    role:        string;
    count:       number;
    oncallTeam:  string;
  }>;
  // Resource allocation snapshot (legacy + enterprise)
  allocatedResources?: {
    ambulance?: number;
    police?:    number;
    fire?:      number;
    drone?:     number;
    sre?:       number;
    seceng?:    number;
    dataeng?:   number;
  };
  resourcePriorityRank?: number;
  resourceTradeoffs?:    string[];
  // Approval gate state
  pendingApprovalId?: string;
  approvedBy?:        string;
  approvedAt?:        Date;
  // Confidence breakdown (enterprise multi-source)
  confidenceBreakdown?: any;
  // Infrastructure (legacy, kept for map display)
  infrastructureRecommendations?: any;
  // Agent decision trace
  traceLog?:   ITraceStep[];
  taskId?:     string;
  metadata:    any;
  createdAt:   Date;
  updatedAt:   Date;
}

const TraceStepSchema = new Schema({
  step:       String,
  agent:      String,
  decision:   String,
  reason:     String,
  confidence: Number,
  timestamp:  Number,
}, { _id: false });

const IncidentSchema: Schema = new Schema({
  incidentId: { type: String, required: true, unique: true },
  roomId:     { type: String, index: true },
  type:       { type: String, required: true },
  subType:    { type: String },
  severity:   {
    type:    String,
    enum:    ['low', 'medium', 'high', 'critical'],
    default: 'low',
  },
  sevLevel: {
    type:    String,
    enum:    ['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4', 'SEV-5'],
  },
  status: {
    type:    String,
    enum:    ['detected', 'analyzing', 'active', 'contained', 'resolving', 'closed', 'retracted', 'unverified'],
    default: 'detected',
  },
  location: {
    lat: { type: Number },
    lng: { type: Number },
  },
  radius:     { type: Number, default: 1000 },
  confidence: { type: Number, default: 0 },
  signals:    [{ type: Schema.Types.ObjectId, ref: 'Signal' }],
  // Blast radius
  blastRadius: { type: Schema.Types.Mixed },
  // SLA
  slaBreachRisk: { type: Schema.Types.Mixed },
  // Responders
  responderAssignments: [{ type: Schema.Types.Mixed }],
  // Resource fields
  allocatedResources:   { type: Schema.Types.Mixed },
  resourcePriorityRank: { type: Number },
  resourceTradeoffs:    [{ type: String }],
  // Approval gate
  pendingApprovalId: { type: String },
  approvedBy:        { type: String },
  approvedAt:        { type: Date },
  // Confidence breakdown
  confidenceBreakdown:           { type: Schema.Types.Mixed },
  // Infrastructure for map
  infrastructureRecommendations: { type: Schema.Types.Mixed },
  // Trace
  traceLog: [TraceStepSchema],
  taskId:   { type: String },
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

export const Incident: mongoose.Model<IIncident> =
  (mongoose.models['Incident'] as mongoose.Model<IIncident>) ??
  mongoose.model<IIncident>('Incident', IncidentSchema);

// ─── DispatchLog ──────────────────────────────────────────────────────────────

export interface IDispatchLog extends Document {
  incidentId:  string;
  service:     'ambulance' | 'police' | 'fire' | 'drone' | 'other';
  message:     string;
  sentBy:      string;
  channel:     'sms' | 'whatsapp' | 'email' | 'push' | 'manual';
  status:      'sent' | 'delivered' | 'failed' | 'acknowledged';
  sentAt:      Date;
  acknowledgedAt?: Date;
}

const DispatchLogSchema = new Schema<IDispatchLog>({
  incidentId:     { type: String, required: true, index: true },
  service:        { type: String, required: true },
  message:        { type: String, required: true },
  sentBy:         { type: String, default: 'operator' },
  channel:        { type: String, default: 'sms' },
  status:         { type: String, default: 'sent' },
  sentAt:         { type: Date, default: Date.now },
  acknowledgedAt: { type: Date },
}, { timestamps: true });

export const DispatchLog: mongoose.Model<IDispatchLog> =
  (mongoose.models['DispatchLog'] as mongoose.Model<IDispatchLog>) ??
  mongoose.model<IDispatchLog>('DispatchLog', DispatchLogSchema);
