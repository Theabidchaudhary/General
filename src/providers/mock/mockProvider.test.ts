import { describe, expect, it } from 'vitest';
import type { JobRequest } from '@/types/models';
import { ProviderError } from '../types';
import { MockProvider } from './mockProvider';

function request(overrides: Partial<JobRequest> = {}): JobRequest {
  return { providerId: 'mock', kind: 'image', prompt: 'a red fox', params: {}, ...overrides };
}

const signal = new AbortController().signal;

describe('MockProvider', () => {
  it('runs the full submit → poll → download flow', async () => {
    const provider = new MockProvider();
    await provider.validate(request());
    const submission = await provider.submit(request({ params: { mockPollRounds: 1 } }), signal);

    const first = await provider.poll(submission, signal);
    expect(first.status).toBe('processing');
    const second = await provider.poll(submission, signal);
    expect(second.status).toBe('succeeded');

    const targets = await provider.resolveDownloads(submission, signal);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.filename).toMatch(/\.png$/);
  });

  it('rejects empty prompts during validation', async () => {
    const provider = new MockProvider();
    await expect(provider.validate(request({ prompt: '   ' }))).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
  });

  it('simulates transient submit failures', async () => {
    const provider = new MockProvider();
    const req = request({ params: { mockFailuresBeforeSuccess: 2 } });
    await expect(provider.submit(req, signal)).rejects.toMatchObject({ code: 'NETWORK' });
    await expect(provider.submit(req, signal)).rejects.toMatchObject({ code: 'NETWORK' });
    await expect(provider.submit(req, signal)).resolves.toMatchObject({ providerId: 'mock' });
  });

  it('simulates rate limiting with retryAfterMs', async () => {
    const provider = new MockProvider();
    try {
      await provider.submit(request({ params: { mockRateLimit: true } }), signal);
      expect.fail('expected throw');
    } catch (error) {
      const providerError = error as ProviderError;
      expect(providerError.code).toBe('RATE_LIMITED');
      expect(providerError.retryable).toBe(true);
      expect(providerError.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it('reports cancelled submissions as failed on poll', async () => {
    const provider = new MockProvider();
    const submission = await provider.submit(request({ params: { mockPollRounds: 5 } }), signal);
    await provider.cancel(submission);
    const result = await provider.poll(submission, signal);
    expect(result).toMatchObject({ status: 'failed', error: { code: 'CANCELLED' } });
  });

  it('aborts operations when the signal is already aborted', async () => {
    const provider = new MockProvider();
    const controller = new AbortController();
    controller.abort();
    await expect(provider.submit(request(), controller.signal)).rejects.toMatchObject({
      code: 'CANCELLED',
    });
  });
});
