// Privileged API calls (approve/veto, operator takeover/resolve) must carry the
// operator key. Set OPERATOR_API_KEY on the server and VITE_OPERATOR_KEY on the
// client to the same value; when unset (local dev) the server allows requests
// through with a startup warning.
const OPERATOR_KEY: string | undefined = (import.meta as any).env?.VITE_OPERATOR_KEY;

export function operatorFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (OPERATOR_KEY) headers['x-operator-key'] = OPERATOR_KEY;
  return fetch(path, { ...init, headers });
}
