// Lightweight in-memory sliding-window limiter. Per server instance only
// (serverless = best-effort, not a hard guarantee) — enough to blunt abuse
// of upload/mutation endpoints. Swap for Upstash/Redis for strict limits.

const g = globalThis as unknown as { __scRL?: Map<string, number[]> };
const store: Map<string, number[]> = g.__scRL ?? new Map();
if (!g.__scRL) g.__scRL = store;

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    store.set(key, hits);
    return false; // blocked
  }
  hits.push(now);
  store.set(key, hits);
  return true; // allowed
}
