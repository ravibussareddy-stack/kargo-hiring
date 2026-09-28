export async function api<T = any>(url: string, method = "POST", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

/** Ranks + pending AI work (probes, drafts). Loops until nothing is pending. */
export async function runRecompute(onProgress?: (pending: number) => void) {
  const errors: string[] = [];
  for (let i = 0; i < 15; i++) {
    const r = await api<{ pending: number; errors: string[] }>("/api/recompute");
    errors.push(...r.errors);
    onProgress?.(r.pending);
    if (!r.pending) break;
  }
  return errors;
}
