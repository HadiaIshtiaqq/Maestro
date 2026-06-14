// Privileged API calls (approve/veto, operator takeover/resolve, admin reset)
// must carry the operator key. To avoid baking a secret into the public bundle,
// the key is supplied at RUNTIME by the operator and kept in localStorage — it
// never appears in the shipped JS. A build-time VITE_OPERATOR_KEY is honored
// only as a local-dev convenience (left empty in the production build).

const STORAGE_KEY = "maestro_operator_key";

function getOperatorKey(): string {
  if (typeof window === "undefined") return "";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  return (import.meta as any).env?.VITE_OPERATOR_KEY || "";
}

/** Set/clear the operator key at runtime (e.g. from a settings field or console). */
export function setOperatorKey(key: string): void {
  if (typeof window === "undefined") return;
  if (key) window.localStorage.setItem(STORAGE_KEY, key);
  else window.localStorage.removeItem(STORAGE_KEY);
}

export function operatorFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let key = getOperatorKey();
  // Prompt once for the key if none is configured, then remember it.
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
