/** Escape user input before embedding in RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Redact credentials from a MongoDB URI for safe logging. */
export function redactMongoUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (parsed.password) parsed.password = "***";
    if (parsed.username) parsed.username = "***";
    return parsed.toString();
  } catch {
    return uri.replace(/:\/\/[^@]+@/, "://***:***@");
  }
}

export function isOperatorKeyValid(key: string | undefined, requiredKey: string | undefined): boolean {
  return !!requiredKey && !!key && key === requiredKey;
}
