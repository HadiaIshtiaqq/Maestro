import { describe, it, expect } from "vitest";
import { extractJson } from "../src/services/jsonExtract";

describe("extractJson", () => {
  it("parses clean JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("recovers JSON wrapped in prose (the real LLM failure mode)", () => {
    const text = 'Sure! Here is the analysis:\n{"sevLevel":"SEV-2","ok":true}\nLet me know if you need more.';
    expect(extractJson(text)).toEqual({ sevLevel: "SEV-2", ok: true });
  });

  it("handles braces inside strings", () => {
    const text = '{"msg":"use {curly} braces","n":2}';
    expect(extractJson(text)).toEqual({ msg: "use {curly} braces", n: 2 });
  });

  it("extracts the first balanced object ignoring trailing junk", () => {
    const text = '{"a":{"b":1}} trailing text ```';
    expect(extractJson(text)).toEqual({ a: { b: 1 } });
  });

  it("throws when there is no JSON", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});
