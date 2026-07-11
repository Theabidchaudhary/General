import { describe, expect, it } from 'vitest';
import { computeBackoffMs, DEFAULT_BACKOFF, type BackoffPolicy } from './backoff';

const NO_JITTER: BackoffPolicy = { baseMs: 100, factor: 2, maxMs: 1_000, jitterRatio: 0 };

describe('computeBackoffMs', () => {
  it('grows exponentially without jitter', () => {
    expect(computeBackoffMs(1, NO_JITTER)).toBe(100);
    expect(computeBackoffMs(2, NO_JITTER)).toBe(200);
    expect(computeBackoffMs(3, NO_JITTER)).toBe(400);
  });

  it('caps at maxMs', () => {
    expect(computeBackoffMs(10, NO_JITTER)).toBe(1_000);
  });

  it('returns 0 for attempts below 1', () => {
    expect(computeBackoffMs(0, NO_JITTER)).toBe(0);
    expect(computeBackoffMs(-3, NO_JITTER)).toBe(0);
  });

  it('applies jitter within the configured ratio', () => {
    const policy: BackoffPolicy = { baseMs: 1_000, factor: 2, maxMs: 60_000, jitterRatio: 0.5 };
    const noJitter = computeBackoffMs(1, policy, () => 0);
    const fullJitter = computeBackoffMs(1, policy, () => 1);
    expect(noJitter).toBe(1_000);
    expect(fullJitter).toBe(500);
  });

  it('stays within bounds for random jitter across attempts', () => {
    for (let attempt = 1; attempt <= 12; attempt++) {
      const delay = computeBackoffMs(attempt, DEFAULT_BACKOFF);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(DEFAULT_BACKOFF.maxMs);
    }
  });
});
