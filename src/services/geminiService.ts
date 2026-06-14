import { createHash } from "crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config/index.js";

const genAI = new GoogleGenerativeAI(config.gemini.apiKey || "");

// ── In-process response cache (5-min TTL) ─────────────────────────────────────
const responseCache = new Map<string, { result: any; expiresAt: number }>();
const CACHE_TTL_MS  = 5 * 60 * 1000;

// ── Degraded output when the LLM is unavailable ──────────────────────────────
// These are deliberately conservative and clearly marked: no fabricated analysis,
// low confidence, and anything reaching the Commander forces human approval.
const DEGRADED_REASON = "DEGRADED: LLM unavailable — no analysis performed; conservative defaults applied";

function buildFallback(prompt: string): any {
  const out = (output: Record<string, any>) => ({
    output: { ...output, degraded: true },
    confidence: 0.2,
    reasoning: DEGRADED_REASON,
    __engine: "degraded (no LLM)",
  });

  if (prompt.includes("Intake & Normalization"))
    return out({ normalizedSignal: null, requiresManualReview: true });
  if (prompt.includes("Correlation & Dedup"))
    return out({ duplicates: [], correlatedSignals: [], requiresManualReview: true });
  if (prompt.includes("Validation & Credibility"))
    return out({
      credibilityAssessment: { weightedScore: 0.5, verdict: "UNVERIFIED — analysis unavailable" },
      conflictResolution:    { hasConflict: false, status: "UNVERIFIED", action: "manual_review" },
      requiresManualReview:  true,
    });
  if (prompt.includes("Classification Agent"))
    return out({ primaryType: "Unclassified Incident", subType: "analysis-unavailable", requiresManualReview: true });
  if (prompt.includes("Severity & Blast-Radius"))
    return out({ sevLevel: "SEV-3", blastRadius: "unknown", slaBreachRisk: "unknown", requiresManualReview: true });
  if (prompt.includes("Responder Allocation"))
    return out({ assignments: [], allocationRationale: "Analysis unavailable — allocate manually", requiresManualReview: true });
  if (prompt.includes("Incident Commander"))
    return out({
      type: "Unclassified Incident",
      sevLevel: "SEV-3",
      recommendedAction: { action: "manual_triage", requiresHumanApproval: true },
      commanderSummary: "Automated analysis unavailable — incident requires manual human triage.",
    });
  return out({ requiresManualReview: true });
}

// ── Core call with exponential backoff retry ──────────────────────────────────
async function callGemini(prompt: string, jsonResponse: boolean, attempt: number): Promise<any> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: jsonResponse ? { responseMimeType: "application/json" } : undefined,
  });

  try {
    const result = await model.generateContent(prompt);
    const text   = result.response.text();
    if (!text?.trim()) throw new Error("Empty response from Gemini");
    return jsonResponse ? JSON.parse(text) : text;
  } catch (err: any) {
    const isRetryable = err?.status === 429 || err?.status === 503 || err?.message?.includes("503") || err?.message?.includes("429");
    if (isRetryable && attempt < 3) {
      const delay = Math.pow(2, attempt) * 800;
      console.warn(`[Gemini] Retry ${attempt + 1}/3 after ${delay}ms (${err.status ?? err.message})`);
      await new Promise(r => setTimeout(r, delay));
      return callGemini(prompt, jsonResponse, attempt + 1);
    }
    throw err;
  }
}

// ── AI/ML API engine (OpenAI-compatible) ─────────────────────────────────────
// Serves as either the PRIMARY engine (PRIMARY_LLM=aiml) or the automatic
// fallback when Gemini is unavailable. Results carry __engine so every agent
// attributes the framework that actually ran.

async function askAiml(prompt: string, jsonResponse: boolean): Promise<any | null> {
  const apiKey = process.env.AIML_API_KEY;
  if (!apiKey) return null;
  const model = process.env.AIML_API_MODEL || "gpt-4o-mini";
  try {
    const res = await fetch(`${process.env.AIML_API_URL || "https://api.aimlapi.com/v1"}/chat/completions`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body:    JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 4096 }),
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 150)}`);
    const data: any = await res.json();
    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!text) return null;
    if (!jsonResponse) return text;
    const clean = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(clean);
    parsed.__engine = `AI/ML API (${model})`;
    return parsed;
  } catch (err: any) {
    console.warn("[AI/ML API] Call failed:", err.message);
    return null;
  }
}

// PRIMARY_LLM=aiml makes AI/ML API the primary engine for every agent (Gemini
// becomes the fallback). Auto-selected when no Gemini key is configured.
const PRIMARY_IS_AIML =
  (process.env.PRIMARY_LLM ?? "").toLowerCase() === "aiml" || !config.gemini.apiKey;

// ── Gemini circuit breaker ───────────────────────────────────────────────────
// After consecutive total failures (e.g. dead quota), skip Gemini's retry
// ladder entirely for a cooldown window and go straight to the fallback —
// otherwise every agent call burns ~10s discovering the same dead key.

let geminiFailStreak    = 0;
let geminiCooldownUntil = 0;
const BREAKER_THRESHOLD   = 3;
const BREAKER_COOLDOWN_MS = 5 * 60 * 1000;

// ── Public API ────────────────────────────────────────────────────────────────
export async function askGemini(prompt: string, jsonResponse: boolean = true): Promise<any> {
  // Primary = AI/ML API: skip Gemini entirely (full demo speed, no dead-key
  // retries) and use Gemini only if AI/ML API itself fails.
  if (PRIMARY_IS_AIML) {
    const cacheKey = `${jsonResponse}::${createHash("sha256").update(prompt).digest("hex")}`;
    const cached   = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.result;

    const aiml = await askAiml(prompt, jsonResponse);
    if (aiml) {
      responseCache.set(cacheKey, { result: aiml, expiresAt: Date.now() + CACHE_TTL_MS });
      return aiml;
    }
    // AI/ML API failed — try Gemini if a key exists, else degrade
    if (!config.gemini.apiKey) return buildFallback(prompt);
  }

  if (Date.now() < geminiCooldownUntil) {
    const aiml = await askAiml(prompt, jsonResponse);
    if (aiml) return aiml;
    return buildFallback(prompt);
  }

  // Cache check — key must cover the FULL prompt: every agent prompt starts with
  // the same long system preamble, so a prefix-based key collides across tasks.
  const cacheKey = `${jsonResponse}::${createHash("sha256").update(prompt).digest("hex")}`;
  const cached   = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    console.log("[Gemini] Cache hit");
    return cached.result;
  }

  try {
    console.log(`[Gemini] → gemini-2.0-flash (${prompt.slice(0, 60).replace(/\n/g, " ")}…)`);
    const result = await callGemini(prompt, jsonResponse, 0);
    geminiFailStreak = 0;
    responseCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err: any) {
    geminiFailStreak += 1;
    if (geminiFailStreak >= BREAKER_THRESHOLD) {
      geminiCooldownUntil = Date.now() + BREAKER_COOLDOWN_MS;
      console.warn(`[Gemini] Circuit breaker OPEN after ${geminiFailStreak} consecutive failures — skipping Gemini for ${BREAKER_COOLDOWN_MS / 60000} min`);
    }
    console.error(`[Gemini] All retries failed (${err.message}) — trying AI/ML API fallback`);
    const aiml = await askAiml(prompt, jsonResponse);
    if (aiml) {
      responseCache.set(cacheKey, { result: aiml, expiresAt: Date.now() + CACHE_TTL_MS });
      return aiml;
    }
    return buildFallback(prompt);
  }
}

// ── Multi-turn chat (incident intake bot) ────────────────────────────────────

const INTAKE_SYSTEM = `You are NEXUS AI, an incident intake assistant for the NEXUS critical-incident response platform.
Your job: gather enough information to file an accurate incident report. Ask ONE short focused question at a time.
Collect: (1) incident type, (2) location/area, (3) severity/how many affected, (4) any injuries or deaths, (5) is it ongoing or contained.
Be empathetic but concise — 1-2 sentences max per reply. Speak in English but accept any language.
After 3-5 exchanges, once you have type + location + severity context, output EXACTLY this on its own line (no markdown):
READY_TO_SUBMIT: {"type":"<incident_type>","locationLabel":"<area_or_address>","severity":"<low|medium|high|critical>","description":"<full_summary>","urgency":7}`;

export async function chatIncidentIntake(
  messages: Array<{ role: "user" | "model"; content: string }>
): Promise<{ reply: string; readyToSubmit: boolean; signal?: Record<string, any> }> {
  if (!config.gemini.apiKey) {
    return { reply: "I need more details — please describe the incident, location, and severity.", readyToSubmit: false };
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const history = messages.slice(0, -1).map(m => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({
    history,
    systemInstruction: { role: "system", parts: [{ text: INTAKE_SYSTEM }] },
  });

  try {
    const lastMessage = messages[messages.length - 1];
    const result = await chat.sendMessage(lastMessage.content);
    const text   = result.response.text().trim();

    const readyIdx = text.indexOf("READY_TO_SUBMIT:");
    if (readyIdx !== -1) {
      try {
        const json  = text.slice(readyIdx + "READY_TO_SUBMIT:".length).trim();
        const signal = JSON.parse(json);
        const replyOnly = text.slice(0, readyIdx).trim() || "I have enough information. Ready to submit your report.";
        return { reply: replyOnly, readyToSubmit: true, signal };
      } catch {}
    }

    return { reply: text, readyToSubmit: false };
  } catch (err: any) {
    console.error("[Gemini] Chat intake error:", err.message);
    return { reply: "Connection issue — please type the incident details and I'll process them.", readyToSubmit: false };
  }
}

// ── Cache stats (for /api/agents/status) ─────────────────────────────────────
export function getGeminiCacheStats() {
  const now = Date.now();
  const entries = [...responseCache.entries()];
  return {
    total:  entries.length,
    active: entries.filter(([, v]) => v.expiresAt > now).length,
    ttlMs:  CACHE_TTL_MS,
  };
}
