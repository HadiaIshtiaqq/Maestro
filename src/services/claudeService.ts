import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export function isClaudeAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function askClaude(prompt: string): Promise<any | null> {
  const client = getClient();
  if (!client) {
    console.warn("[Claude] No ANTHROPIC_API_KEY — falling back to Gemini");
    return null;
  }

  try {
    console.log(`[Claude] → claude-sonnet-4-6 (${prompt.slice(0, 60).replace(/\n/g, " ")}…)`);
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (!text) return null;

    // Strip markdown fences if model adds them despite instructions
    const clean = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    try {
      return JSON.parse(clean);
    } catch {
      return { output: {}, confidence: 0.5, reasoning: text };
    }
  } catch (err: any) {
    console.error(`[Claude] Error: ${err.message}`);
    return null;
  }
}
