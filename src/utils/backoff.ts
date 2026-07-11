/** Exponential backoff with full jitter, used by the queue retry engine. */

export interface BackoffPolicy {
  /** Delay before the first retry. */
  baseMs: number;
  /** Multiplier applied per additional attempt. */
  factor: number;
  /** Upper bound on any computed delay. */
  maxMs: number;
  /** 0..1 — how much of the delay may be randomized away (full jitter = 1). */
  jitterRatio: number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = {
  baseMs: 2_000,
  factor: 2,
  maxMs: 5 * 60_000,
  jitterRatio: 0.3,
};

/**
 * Computes the delay before retry number `attempt` (1-based: attempt 1 is the
 * first retry). `random` is injectable for deterministic tests.
 */
export function computeBackoffMs(
  attempt: number,
  policy: BackoffPolicy = DEFAULT_BACKOFF,
  random: () => number = Math.random,
): number {
  if (attempt < 1) return 0;
  const exponential = policy.baseMs * Math.pow(policy.factor, attempt - 1);
  const capped = Math.min(exponential, policy.maxMs);
  const jitterSpan = capped * policy.jitterRatio;
  return Math.round(capped - jitterSpan * random());
}
