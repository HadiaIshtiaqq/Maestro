import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "./jsonExtract.js";

// The Validation & Credibility agent runs on Claude (Anthropic). It uses the
// direct Anthropic API when ANTHROPIC_API_KEY is set, otherwise it runs the same
// Claude models through AI/ML API (a unified provider) using AIML_API_KEY — so
// the cross-framework "Claude" agent is genuinely Claude either way, without
// requiring a separate Anthropic account.

const CLAUDE_MODEL      = process.env.CLAUDE_MODEL ?? "claude-haiku-4-5-20251001";
const ANTHROPIC_MODEL   = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

let _client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export function isClaudeAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY || !!process.env.AIML_API_KEY;
}

function parse(text: string, engine: string): any {
  if (!text) return null;
  try {
    const out = extractJson(text);
    out.__engine = engine;
    return out;
  } catch {
    return { output: {}, confidence: 0.5, reasoning: text, __engine: engine };
  }
}

// Claude via the AI/ML API unified endpoint (OpenAI-compatible).
async function askClaudeViaAiml(prompt: string): Promise<any | null> {
  const apiKey = process.env.AIML_API_KEY;
  if (!apiKey) return null;
  try {
    console.log(`[Claude] → ${CLAUDE_MODEL} via AI/ML API`);
    const res = await fetch(`${process.env.AIML_API_URL || "https://api.aimlapi.com/v1"}/chat/completions`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body:    JSON.stringify({ model: CLAUDE_MODEL, messages: [{ role: "user", content: prompt }], max_tokens: 4096 }),
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 150)}`);
    const data: any = await res.json();
    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    return parse(text, `Claude (${CLAUDE_MODEL}) via AI/ML API`);
  } catch (err: any) {
    console.warn("[Claude] AI/ML route failed:", err.message);
    return null;
  }
}

export async function askClaude(prompt: string): Promise<any | null> {
  // Prefer the direct Anthropic API if a key is configured.
  const client = getClient();
  if (client) {
    try {
      console.log(`[Claude] → ${ANTHROPIC_MODEL} (Anthropic)`);
      const response = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });
      const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
      const out = parse(text, `Claude (${ANTHROPIC_MODEL})`);
      if (out) return out;
    } catch (err: any) {
      console.error(`[Claude] Anthropic error: ${err.message} — trying AI/ML route`);
    }
  }
  // Otherwise (or on failure) run Claude through AI/ML API.
  return askClaudeViaAiml(prompt);
}
