export const RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 120_000, 300_000, 900_000] as const;
export function nextRetryDelay(attemptCount: number): number { return RETRY_DELAYS_MS[Math.min(Math.max(0, attemptCount), RETRY_DELAYS_MS.length - 1)]!; }
// Auth/session and temporary membership responses must not turn a user's unsent work into a
// permanent blocked item. The next refresh/online event can deliver it with the same idempotency key.
export function isRetryableStatus(status: number): boolean { return status === 401 || status === 403 || status === 408 || status === 429 || status >= 500; }
