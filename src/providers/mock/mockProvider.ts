/**
 * Simulated provider used for development and tests. Behavior is scripted
 * per-request via params so queue scenarios (success, retries, rate limits,
 * validation failures) can be exercised without any real service.
 *
 * Recognized request params:
 *   mockFailuresBeforeSuccess (number) — submit() throws a retryable NETWORK
 *     error this many times before succeeding.
 *   mockRateLimit (boolean) — submit() throws RATE_LIMITED with retryAfterMs.
 *   mockInvalid (boolean) — validate() rejects with INVALID_REQUEST.
 *   mockPollRounds (number) — poll() reports 'processing' this many times
 *     before 'succeeded' (default 1).
 */

import type {
  DownloadTarget,
  JobRequest,
  ProviderCapability,
  ProviderSubmission,
} from '@/types/models';
import { createId } from '@/utils/id';
import type { AuthStatus, PollResult, ProviderAdapter } from '../types';
import { ProviderError } from '../types';

interface MockJobState {
  request: JobRequest;
  remainingPollRounds: number;
  cancelled: boolean;
}

export class MockProvider implements ProviderAdapter {
  readonly id = 'mock';
  readonly name = 'Mock Provider';

  #jobs = new Map<string, MockJobState>();
  #submitFailures = new Map<string, number>();

  async getAuthStatus(): Promise<AuthStatus> {
    return 'authenticated';
  }

  async getCapabilities(): Promise<ProviderCapability[]> {
    return [
      { kind: 'image', key: 'image.txt2img', label: 'Text to image', limits: { maxPromptChars: 2000 } },
      { kind: 'video', key: 'video.txt2vid', label: 'Text to video', limits: { maxSeconds: 10 } },
    ];
  }

  async validate(request: JobRequest): Promise<void> {
    if (!request.prompt.trim()) {
      throw new ProviderError('INVALID_REQUEST', 'Prompt must not be empty');
    }
    if (request.params['mockInvalid'] === true) {
      throw new ProviderError('INVALID_REQUEST', 'Simulated validation failure');
    }
  }

  async submit(request: JobRequest, signal: AbortSignal): Promise<ProviderSubmission> {
    this.#throwIfAborted(signal);

    const failuresWanted = Number(request.params['mockFailuresBeforeSuccess'] ?? 0);
    if (failuresWanted > 0) {
      const key = request.prompt;
      const soFar = this.#submitFailures.get(key) ?? 0;
      if (soFar < failuresWanted) {
        this.#submitFailures.set(key, soFar + 1);
        throw new ProviderError('NETWORK', `Simulated network failure ${soFar + 1}`);
      }
    }

    if (request.params['mockRateLimit'] === true) {
      throw new ProviderError('RATE_LIMITED', 'Simulated rate limit', { retryAfterMs: 10 });
    }

    const remoteId = createId('mockjob');
    this.#jobs.set(remoteId, {
      request,
      remainingPollRounds: Math.max(0, Number(request.params['mockPollRounds'] ?? 1)),
      cancelled: false,
    });
    return { providerId: this.id, remoteId, submittedAt: Date.now() };
  }

  async poll(submission: ProviderSubmission, signal: AbortSignal): Promise<PollResult> {
    this.#throwIfAborted(signal);
    const state = this.#jobs.get(submission.remoteId);
    if (!state) {
      return {
        status: 'failed',
        error: { code: 'UNKNOWN', message: 'Unknown mock submission', retryable: false },
      };
    }
    if (state.cancelled) {
      return {
        status: 'failed',
        error: { code: 'CANCELLED', message: 'Cancelled', retryable: false },
      };
    }
    if (state.remainingPollRounds > 0) {
      state.remainingPollRounds -= 1;
      return { status: 'processing', progress: 0.5 };
    }
    return { status: 'succeeded' };
  }

  async resolveDownloads(
    submission: ProviderSubmission,
    signal: AbortSignal,
  ): Promise<DownloadTarget[]> {
    this.#throwIfAborted(signal);
    const state = this.#jobs.get(submission.remoteId);
    const kind = state?.request.kind ?? 'image';
    const extension = kind === 'image' ? 'png' : 'mp4';
    return [
      {
        url: `https://mock.invalid/artifacts/${submission.remoteId}.${extension}`,
        filename: `${submission.remoteId}.${extension}`,
        kind,
      },
    ];
  }

  async cancel(submission: ProviderSubmission): Promise<void> {
    const state = this.#jobs.get(submission.remoteId);
    if (state) state.cancelled = true;
  }

  #throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new ProviderError('CANCELLED', 'Operation aborted');
    }
  }
}
