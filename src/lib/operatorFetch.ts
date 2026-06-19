// Privileged API calls (approve/veto, operator takeover/resolve, admin reset)
// carry the operator key supplied at runtime via localStorage or a prompt.
// The key is never baked into the production frontend bundle.

const STORAGE_KEY = "maestro_operator_key";

function getOperatorKey(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY) || "";
}

/** Set/clear the operator key at runtime (e.g. from a settings field or console). */
export function setOperatorKey(key: string): void {
  if (typeof window === "undefined") return;
  if (key) window.localStorage.setItem(STORAGE_KEY, key);
  else window.localStorage.removeItem(STORAGE_KEY);
}

export function getStoredOperatorKey(): string {
  return getOperatorKey();
}

export function operatorFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let key = getOperatorKey();
  if (!key && typeof window !== "undefined" && typeof window.prompt === "function") {
    key = window.prompt("Operator key (for privileged actions):") || "";
    if (key) setOperatorKey(key);
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (key) headers["x-operator-key"] = key;
  return fetch(path, { ...init, headers });
}

/** Auth payload for Socket.IO handshake (operator dashboard). */
export function getSocketAuth(): { operatorKey?: string } {
  const key = getOperatorKey();
  return key ? { operatorKey: key } : {};
}
