import { describe, it, expect } from "vitest";
import { escapeRegExp, redactMongoUri, isOperatorKeyValid } from "../src/lib/authUtils";

describe("authUtils", () => {
  it("escapeRegExp neutralizes regex metacharacters", () => {
    expect(escapeRegExp("a+b(c)")).toBe("a\\+b\\(c\\)");
    expect(new RegExp(escapeRegExp(".*")).test("hello")).toBe(false);
  });

  it("redactMongoUri hides credentials", () => {
    const redacted = redactMongoUri("mongodb+srv://user:secret@cluster.example.net/maestro");
    expect(redacted).not.toContain("secret");
    expect(redacted).toContain("***");
  });

  it("isOperatorKeyValid matches only when both sides are set and equal", () => {
    expect(isOperatorKeyValid("abc", "abc")).toBe(true);
    expect(isOperatorKeyValid("abc", "def")).toBe(false);
    expect(isOperatorKeyValid(undefined, "def")).toBe(false);
  });
});
