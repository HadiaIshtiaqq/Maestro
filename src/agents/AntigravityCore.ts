import { askGemini } from "../services/geminiService";
import { askClaude } from "../services/claudeService";
import { extractJson } from "../services/jsonExtract";
import mongoose, { Schema, Document } from "mongoose";

// ─── Persisted Trace Model ────────────────────────────────────────────────────

interface IPersistedTrace extends Document {
  taskId:      string;
  status:      string;
  startedAt:   number;
  endedAt?:    number;
  durationMs?: number;
  results:     any[];
}

const PersistedTraceSchema = new Schema<IPersistedTrace>({
  taskId:     { type: String, required: true, unique: true },
  status:     { type: String },
  startedAt:  { type: Number },
  endedAt:    { type: Number },
  durationMs: { type: Number },
  results:    [{ type: Schema.Types.Mixed }],
}, { timestamps: true });

// Avoid OverwriteModelError on hot reload
const TraceModel = mongoose.models["AgentTrace"] ??
  mongoose.model<IPersistedTrace>("AgentTrace", PersistedTraceSchema);

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface AgentTask {
  id:       string;
  type:     string;
  data:     any;
  context?: any;
}

export interface AgentResult {
  agentId:    string;
  output:     any;
  confidence: number;
  reasoning:  string;
  engine?:    string;   // which provider actually ran (cross-framework visibility)
  timestamp:  number;
}

export interface AgentTrace {
  taskId:    string;
  results:   AgentResult[];
  status:    'pending' | 'running' | 'completed' | 'failed';
  startedAt: number;
  endedAt?:  number;
  durationMs?: number;
}

// ─── Base Agent ───────────────────────────────────────────────────────────────

export abstract class AntigravityAgent {
  constructor(public id: string, public name: string) {}
  abstract execute(task: AgentTask): Promise<AgentResult>;
}

// ─── GeminiAgent (LLM-powered agent) ─────────────────────────────────────────

export class GeminiAgent extends AntigravityAgent {
  constructor(id: string, name: string, private systemPrompt: string) {
    super(id, name);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const prompt = `
${this.systemPrompt}

=== INCOMING TASK ===
Task ID   : ${task.id}
Task Type : ${task.type}
Signal/Data: ${JSON.stringify(task.data, null, 2)}
Prior Agent Context: ${JSON.stringify(task.context ?? {}, null, 2)}

Respond ONLY with a valid JSON object. No markdown fences. No commentary.
`;

    const result = await askGemini(prompt);
    const engine = result.__engine ?? 'Gemini';
    return {
      agentId:    this.id,
      output:     result.output     ?? result,
      confidence: result.confidence ?? 0.5,
      reasoning:  `${result.reasoning ?? 'Executed via LLM'}${engine !== 'Gemini' ? ` [via ${engine}]` : ''}`,
      engine,
      timestamp:  Date.now(),
    };
  }
}

// ─── ClaudeAgent (cross-framework — Anthropic) ───────────────────────────────
// Uses claude-sonnet-4-6 when ANTHROPIC_API_KEY is set; falls back to Gemini.

export class ClaudeAgent extends AntigravityAgent {
  constructor(id: string, name: string, private systemPrompt: string) {
    super(id, name);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const prompt = `
${this.systemPrompt}

=== INCOMING TASK ===
Task ID   : ${task.id}
Task Type : ${task.type}
Signal/Data: ${JSON.stringify(task.data, null, 2)}
Prior Agent Context: ${JSON.stringify(task.context ?? {}, null, 2)}

Respond ONLY with a valid JSON object. No markdown fences. No commentary.
`;

    // Try Claude first (direct Anthropic or Claude via AI/ML API); fall back to
    // Gemini/AI-ML only if Claude is entirely unavailable.
    let result = await askClaude(prompt);
    let engine = result?.__engine ?? 'Claude';
    if (!result) {
      result = await askGemini(prompt);
      engine = result?.__engine ? `${result.__engine} (fallback)` : 'Gemini (fallback)';
    }

    return {
      agentId:    this.id,
      output:     result?.output     ?? result,
      confidence: result?.confidence ?? 0.5,
      reasoning:  `${result?.reasoning ?? 'Executed'} [via ${engine}]`,
      engine,
      timestamp:  Date.now(),
    };
  }
}

// ─── OpenAICompatAgent (cross-framework — AI/ML API, Featherless, etc.) ──────
// Runs any OpenAI-compatible chat-completions endpoint. Falls back to Gemini
// when the provider key is missing or the call fails, recording which engine
// actually ran in the result (visible in the Band room trail).

export interface OpenAICompatConfig {
  label:     string;   // e.g. "AI/ML API", "Featherless"
  baseUrl:   string;   // e.g. https://api.aimlapi.com/v1
  apiKeyEnv: string;   // env var holding the key, e.g. AIML_API_KEY
  modelEnv:  string;   // env var overriding the model
  model:     string;   // default model id
}

export class OpenAICompatAgent extends AntigravityAgent {
  constructor(
    id: string,
    name: string,
    private systemPrompt: string,
    private cfg: OpenAICompatConfig,
  ) {
    super(id, name);
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const prompt = `
${this.systemPrompt}

=== INCOMING TASK ===
Task ID   : ${task.id}
Task Type : ${task.type}
Signal/Data: ${JSON.stringify(task.data, null, 2)}
Prior Agent Context: ${JSON.stringify(task.context ?? {}, null, 2)}

Respond ONLY with a valid JSON object. No markdown fences. No commentary.
`;

    const apiKey = process.env[this.cfg.apiKeyEnv];
    const model  = process.env[this.cfg.modelEnv] || this.cfg.model;

    if (apiKey) {
      try {
        const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body:    JSON.stringify({
            model,
            messages:   [{ role: "user", content: prompt }],
            max_tokens: 4096,
          }),
        });
        if (!res.ok) throw new Error(`${this.cfg.label} ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data: any = await res.json();
        const text = (data.choices?.[0]?.message?.content ?? "").trim();
        const parsed = extractJson(text);
        const engine = `${this.cfg.label} (${model})`;
        console.log(`[${this.cfg.label}] → ${model} OK for ${this.id}`);
        return {
          agentId:    this.id,
          output:     parsed.output     ?? parsed,
          confidence: parsed.confidence ?? 0.5,
          reasoning:  `${parsed.reasoning ?? 'Executed'} [via ${engine}]`,
          engine,
          timestamp:  Date.now(),
        };
      } catch (err: any) {
        console.warn(`[${this.cfg.label}] Failed for ${this.id} — falling back to Gemini:`, err.message);
      }
    }

    const result = await askGemini(prompt);
    const fallbackEngine = result.__engine ? `${result.__engine} (fallback)` : 'Gemini (fallback)';
    return {
      agentId:    this.id,
      output:     result.output     ?? result,
      confidence: result.confidence ?? 0.5,
      reasoning:  `${result.reasoning ?? 'Executed'} [via ${fallbackEngine}]`,
      engine:     fallbackEngine,
      timestamp:  Date.now(),
    };
  }
}

// ─── Sequential Orchestrator ──────────────────────────────────────────────────
// Runs a pipeline of agents one-by-one, passing each result as context to the next.

export class AntigravityOrchestrator {
  private agents: Map<string, AntigravityAgent> = new Map();
  private traces: Map<string, AgentTrace>       = new Map();

  registerAgent(agent: AntigravityAgent) {
    this.agents.set(agent.id, agent);
  }

  getAgent(agentId: string): AntigravityAgent | undefined {
    return this.agents.get(agentId);
  }

  async runPipeline(
    taskId: string,
    initialTask: AgentTask,
    sequence: string[],
    onStepComplete?: (agentId: string, result: AgentResult, task: AgentTask) => Promise<void>
  ): Promise<AgentTrace> {
    const trace: AgentTrace = {
      taskId,
      results:   [],
      status:    'running',
      startedAt: Date.now(),
    };
    this.traces.set(taskId, trace);

    let currentTask = initialTask;

    for (const agentId of sequence) {
      const agent = this.agents.get(agentId);
      if (!agent) {
        console.warn(`[Antigravity] Agent "${agentId}" not registered — skipping`);
        continue;
      }

      try {
        const result = await agent.execute(currentTask);
        trace.results.push(result);
        // Notify caller after each step (Band room posting, live updates)
        if (onStepComplete) {
          await onStepComplete(agentId, result, currentTask).catch(e =>
            console.warn(`[Antigravity] onStepComplete error for ${agentId}:`, e.message)
          );
        }
        // Each agent's output becomes context for the next
        currentTask = {
          ...currentTask,
          context: { ...(currentTask.context ?? {}), [agentId]: result.output },
        };
      } catch (err) {
        console.error(`[Antigravity] Agent "${agentId}" failed:`, err);
        trace.status  = 'failed';
        trace.endedAt = Date.now();
        trace.durationMs = trace.endedAt - trace.startedAt;
        return trace;
      }
    }

    trace.status     = 'completed';
    trace.endedAt    = Date.now();
    trace.durationMs = trace.endedAt - trace.startedAt;

    // Persist to MongoDB (non-blocking)
    this.persistTrace(trace).catch(err =>
      console.warn("[Antigravity] Trace persist failed:", err.message)
    );

    return trace;
  }

  private async persistTrace(trace: AgentTrace): Promise<void> {
    if (mongoose.connection.readyState !== 1) return;
    await (TraceModel as any).findOneAndUpdate(
      { taskId: trace.taskId },
      { ...trace },
      { upsert: true, new: true }
    );
  }

  getTrace(taskId: string): AgentTrace | undefined {
    return this.traces.get(taskId);
  }

  getAllTraces(): AgentTrace[] {
    return [...this.traces.values()];
  }

  async getPersistedTraces(limit = 50): Promise<any[]> {
    if (mongoose.connection.readyState !== 1) return this.getAllTraces();
    return TraceModel.find().sort({ startedAt: -1 }).limit(limit).lean();
  }
}

// ─── ConcurrentOrchestrator ───────────────────────────────────────────────────
// Runs multiple independent pipelines in parallel (one per active crisis).
// Used when simultaneous events arrive and must not block each other.

export class ConcurrentOrchestrator {
  private base: AntigravityOrchestrator;

  constructor(base: AntigravityOrchestrator) {
    this.base = base;
  }

  /**
   * Submit multiple tasks to run concurrently.
   * Returns all traces once every pipeline finishes (settled — failures don't block others).
   */
  async runParallel(
    tasks: Array<{ taskId: string; initialTask: AgentTask; sequence: string[] }>
  ): Promise<AgentTrace[]> {
    const jobs = tasks.map(({ taskId, initialTask, sequence }) =>
      this.base.runPipeline(taskId, initialTask, sequence)
    );
    // allSettled so one pipeline failure doesn't abort others
    const settled = await Promise.allSettled(jobs);
    return settled.map(r => (r.status === 'fulfilled' ? r.value : r.reason as AgentTrace));
  }

  getTrace(taskId: string) {
    return this.base.getTrace(taskId);
  }
}
