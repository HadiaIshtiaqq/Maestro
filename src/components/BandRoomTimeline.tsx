import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Shield, GitBranch, CheckCircle, XCircle, AlertTriangle, Clock, Users, Activity } from "lucide-react";
import { operatorFetch } from "../lib/operatorFetch";

type MsgType = 'finding' | 'proposal' | 'approval_request' | 'approval' | 'retraction' | 'status';

interface BandMessage {
  id:                      string;
  msg_type:                MsgType;
  from_agent:              string;
  incident_id:             string;
  room_id:                 string;
  step:                    string;
  payload:                 any;
  confidence:              number;
  requires_human_approval: boolean;
  engine?:                 string;
  ts:                      string;
}

interface BandRoom {
  room_id:      string;
  incident_id:  string;
  participants: string[];
  status:       'open' | 'closed';
  created_at:   string;
}

interface Props {
  incidentId: string;
  onApprove?: (proposalMsgId: string) => void;
  onVeto?:    (proposalMsgId: string) => void;
}

const MSG_CONFIG: Record<MsgType, { label: string; color: string; bg: string; border: string; Icon: any }> = {
  finding:          { label: 'Finding',          color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/25',   Icon: Activity },
  proposal:         { label: 'Proposal',          color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25',  Icon: AlertTriangle },
  approval_request: { label: 'Approval Needed',   color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30', Icon: Clock },
  approval:         { label: 'Approved',           color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25',Icon: CheckCircle },
  retraction:       { label: 'Retraction',         color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/25',    Icon: XCircle },
  status:           { label: 'Status',             color: 'text-slate-400',   bg: 'bg-slate-500/10',   border: 'border-slate-500/25',  Icon: GitBranch },
};

const AGENT_COLORS: Record<string, string> = {
  'intake-normalization':   'text-blue-400',
  'correlation-dedup':      'text-indigo-400',
  'validation-credibility': 'text-violet-400',
  'classification':         'text-purple-400',
  'severity-blast-radius':  'text-red-400',
  'responder-allocation':   'text-orange-400',
  'dependency-impact-sim':  'text-amber-400',
  'mitigation-projection':  'text-yellow-400',
  'runbook-advisor':        'text-lime-400',
  'stakeholder-comms':      'text-green-400',
  'incident-commander':     'text-cyan-400',
  'human-commander':        'text-emerald-400',
};

function formatTs(iso: string) {
  try { return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }); }
  catch { return ''; }
}

function AgentDot({ agent }: { agent: string }) {
  const color = AGENT_COLORS[agent] ?? 'text-white/50';
  return (
    <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 border border-white/10 ${color}`}>
      {agent.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
    </span>
  );
}

export default function BandRoomTimeline({ incidentId, onApprove, onVeto }: Props) {
  const [room,     setRoom]     = useState<BandRoom | null>(null);
  const [messages, setMessages] = useState<BandMessage[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = await fetch(`/api/band/rooms/by-incident/${incidentId}`);
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      setRoom(data.room ?? null);
      setMessages(data.messages ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [incidentId]);

  // Poll for new messages every 3s when room is open
  useEffect(() => {
    if (!room || room.status === 'closed') return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [room?.room_id, room?.status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleApprove = async (msg: BandMessage) => {
    setApproving(msg.id);
    try {
      await operatorFetch('/api/band/approve', {
        method: 'POST',
        body: JSON.stringify({ proposalMsgId: msg.id, approverId: 'human-commander' }),
      });
      onApprove?.(msg.id);
      await load();
    } finally { setApproving(null); }
  };

  const handleVeto = async (msg: BandMessage) => {
    setApproving(msg.id);
    try {
      await operatorFetch('/api/band/veto', {
        method: 'POST',
        body: JSON.stringify({ proposalMsgId: msg.id, approverId: 'human-commander', notes: 'Vetoed via operator UI' }),
      });
      onVeto?.(msg.id);
      await load();
    } finally { setApproving(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-white/20 text-xs">
        <Activity className="w-4 h-4 mr-2 animate-pulse" />Loading Band room…
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-white/20 text-xs gap-2">
        <GitBranch className="w-6 h-6 opacity-30" />
        <p>No Band room yet — pipeline pending</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Room header */}
      <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Band Room</span>
            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase ${
              room.status === 'open'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                : 'bg-red-500/10 text-red-400 border-red-500/25'
            }`}>{room.status}</span>
          </div>
          <span className="text-[9px] font-mono text-white/25">{messages.length} msgs</span>
        </div>
        <p className="text-[9px] font-mono text-white/20 break-all mb-2">{room.room_id}</p>
        <div className="flex items-center gap-1 flex-wrap">
          <Users className="w-3 h-3 text-white/30 flex-shrink-0" />
          {room.participants.slice(0, 8).map(p => (
            <span key={p} className={`text-[7px] font-bold px-1 py-0.5 rounded bg-white/5 ${AGENT_COLORS[p] ?? 'text-white/40'}`}>
              {p.replace(/-/g, ' ')}
            </span>
          ))}
          {room.participants.length > 8 && (
            <span className="text-[7px] text-white/25">+{room.participants.length - 8}</span>
          )}
        </div>
      </div>

      {/* Message timeline */}
      <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
        <AnimatePresence>
          {messages.map((msg, idx) => {
            const cfg = MSG_CONFIG[msg.msg_type] ?? MSG_CONFIG.finding;
            const { Icon } = cfg;
            const isApprovalRequest = msg.msg_type === 'approval_request';
            const isApproved = messages.some(m => m.msg_type === 'approval' && m.payload?.proposal_id === msg.id);
            const isVetoed   = messages.some(m => m.msg_type === 'approval' && m.payload?.proposal_id === msg.id && m.payload?.decision === 'vetoed');

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.025, 0.3) }}
                className={`rounded-xl border p-3 ${cfg.bg} ${cfg.border}`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-3 h-3 ${cfg.color} flex-shrink-0`} />
                    <span className={`text-[8px] font-black uppercase tracking-wider ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <AgentDot agent={msg.from_agent} />
                    {msg.engine && (
                      <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/25 uppercase tracking-wide">
                        {msg.engine}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {msg.confidence > 0 && (
                      <span className="text-[8px] text-white/30 font-mono">
                        {Math.round(msg.confidence * 100)}%
                      </span>
                    )}
                    <span className="text-[8px] text-white/20 font-mono">{formatTs(msg.ts)}</span>
                  </div>
                </div>

                {/* Payload summary */}
                <div className="text-[10px] text-white/60 leading-snug">
                  {msg.msg_type === 'approval_request' && msg.payload?.action && (
                    <div className="space-y-1">
                      <p className="font-bold text-orange-300">
                        Proposed: {msg.payload.action?.action ?? 'Action pending approval'}
                      </p>
                      {msg.payload.commanderSummary && (
                        <p className="text-white/50 text-[9px] leading-relaxed line-clamp-3">
                          {msg.payload.commanderSummary}
                        </p>
                      )}
                    </div>
                  )}
                  {msg.msg_type === 'proposal' && msg.payload?.commanderSummary && (
                    <p className="line-clamp-2">{msg.payload.commanderSummary}</p>
                  )}
                  {msg.msg_type === 'finding' && (
                    <p className="text-white/40 font-mono text-[9px]">
                      Step: {msg.step}
                      {msg.payload?.sevLevel ? ` · ${msg.payload.sevLevel}` : ''}
                      {msg.payload?.primaryType ? ` · ${msg.payload.primaryType}` : ''}
                      {msg.payload?.credibilityAssessment?.displayLevel ? ` · ${msg.payload.credibilityAssessment.displayLevel}` : ''}
                    </p>
                  )}
                  {msg.msg_type === 'approval' && (
                    <p className={msg.payload?.decision === 'approved' ? 'text-emerald-300' : 'text-red-300'}>
                      {msg.payload?.decision === 'approved' ? '✓ Action approved by Human Commander' : '✕ Action vetoed by Human Commander'}
                      {msg.payload?.notes ? ` — ${msg.payload.notes}` : ''}
                    </p>
                  )}
                  {msg.msg_type === 'retraction' && (
                    <p className="text-red-300">
                      Retraction: {msg.payload?.reason ?? 'false_alarm'} — resources released
                    </p>
                  )}
                  {msg.msg_type === 'status' && (
                    <p className="text-slate-300">{msg.payload?.status ?? msg.step}</p>
                  )}
                </div>

                {/* Approval gate buttons */}
                {isApprovalRequest && !isApproved && !isVetoed && (
                  <div className="mt-3 pt-2.5 border-t border-orange-500/20 flex gap-2">
                    <button
                      onClick={() => handleApprove(msg)}
                      disabled={approving === msg.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
                    >
                      <CheckCircle className="w-3 h-3" />
                      {approving === msg.id ? 'Processing…' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleVeto(msg)}
                      disabled={approving === msg.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-700/80 hover:bg-red-600 text-white text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50"
                    >
                      <XCircle className="w-3 h-3" />
                      Veto
                    </button>
                  </div>
                )}
                {isApprovalRequest && (isApproved || isVetoed) && (
                  <div className={`mt-2 text-[9px] font-black uppercase ${isVetoed ? 'text-red-400' : 'text-emerald-400'}`}>
                    {isVetoed ? '✕ Vetoed' : '✓ Approved'}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
