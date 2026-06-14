// Robust JSON extraction for LLM output. Models (especially OpenAI-compatible
// ones) sometimes wrap JSON in ```fences```, prose, or trailing commentary.
// Strict JSON.parse then fails and the agent degrades. This recovers the JSON
// object by: stripping fences, then if needed slicing the first balanced
// {...} or [...] block and parsing that.

export function extractJson(text: string): any {
  const stripped = text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(stripped);
  } catch { /* fall through to balanced-scan */ }

  const start = stripped.search(/[{[]/);
  if (start === -1) throw new Error("no JSON object found in LLM output");

  const open = stripped[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return JSON.parse(stripped.slice(start, i + 1));
    }
  }
  throw new Error("unbalanced JSON in LLM output");
}
