import { describe, expect, it } from 'vitest';
import { MockProvider } from '@/providers/mock/mockProvider';
import { ProviderRegistry } from '@/providers/registry';
import { MemoryJobStore } from '@/services/storage/jobStore';
import type { Job, JobRequest, JobState } from '@/types/models';
import { QueueEngine } from './engine';

const FAST_BACKOFF = { baseMs: 1, factor: 1, maxMs: 5, jitterRatio: 0 };

function makeEngine(options: { store?: MemoryJobStore; maxConcurrent?: number } = {}) {
  const registry = new ProviderRegistry();
  registry.register(new MockProvider());
  const store = options.store ?? new MemoryJobStore();
  const engine = new QueueEngine({
    store,
    registry,
    maxConcurrent: options.maxConcurrent ?? 2,
    maxAttempts: 3,
    backoff: FAST_BACKOFF,
    pollIntervalMs: 1,
  });
  return { engine, store };
}

function request(overrides: Partial<JobRequest> = {}): JobRequest {
  return { providerId: 'mock', kind: 'image', prompt: `prompt ${Math.random()}`, params: {}, ...overrides };
}

/** Resolves once the job reaches one of the given states. */
function waitForState(
  engine: QueueEngine,
  jobId: string,
  states: JobState[],
  timeoutMs = 3_000,
): Promise<Job> {
  return new Promise((resolve, reject) => {
    const existing = engine.getJob(jobId);
    if (existing && states.includes(existing.state)) {
      resolve(existing);
      return;
    }
    const timer = setTimeout(() => {
      off();
      reject(new Error(`Timed out waiting for ${jobId} to reach ${states.join('|')}`));
    }, timeoutMs);
    const off = engine.events.on('job-updated', (job) => {
      if (job.id === jobId && states.includes(job.state)) {
        clearTimeout(timer);
        off();
        resolve(job);
      }
    });
  });
}

describe('QueueEngine', () => {
  it('runs a job through the happy path to completed', async () => {
    const { engine } = makeEngine();
    const observed: JobState[] = [];
    engine.events.on('job-updated', (job) => observed.push(job.state));

    const job = await engine.enqueue(request());
    const finished = await waitForState(engine, job.id, ['completed', 'failed']);

    expect(finished.state).toBe('completed');
    expect(finished.attempts).toBe(1);
    expect(finished.outputs).toHaveLength(1);
    expect(finished.submission?.providerId).toBe('mock');
    expect(observed).toContain('validating');
    expect(observed).toContain('running');
  });

  it('retries transient failures with backoff and then succeeds', async () => {
    const { engine } = makeEngine();
    const job = await engine.enqueue(request({ params: { mockFailuresBeforeSuccess: 2 } }));
    const finished = await waitForState(engine, job.id, ['completed', 'failed']);
    expect(finished.state).toBe('completed');
    expect(finished.attempts).toBe(3);
  });

  it('parks rate-limited jobs in waiting before retrying', async () => {
    const { engine } = makeEngine();
    const sawWaiting = new Promise<void>((resolve) => {
      engine.events.on('job-updated', (job) => {
        if (job.state === 'waiting') resolve();
      });
    });
    // First submit rate-limits; the mock only rate-limits when the flag is
    // set, so clear it after the first failure by using failures-then-success
    // semantics: rate limit fires every submit, so cap attempts to observe
    // the waiting → failed path deterministically.
    const job = await engine.enqueue(request({ params: { mockRateLimit: true } }), {
      maxAttempts: 2,
    });
    await sawWaiting;
    const finished = await waitForState(engine, job.id, ['completed', 'failed']);
    expect(finished.state).toBe('failed');
    expect(finished.error?.code).toBe('RATE_LIMITED');
    expect(finished.attempts).toBe(2);
  });

  it('fails fast on non-retryable validation errors', async () => {
    const { engine } = makeEngine();
    const job = await engine.enqueue(request({ params: { mockInvalid: true } }));
    const finished = await waitForState(engine, job.id, ['completed', 'failed']);
    expect(finished.state).toBe('failed');
    expect(finished.error?.code).toBe('INVALID_REQUEST');
    expect(finished.attempts).toBe(0);
  });

  it('exhausts maxAttempts on persistent transient failures', async () => {
    const { engine } = makeEngine();
    const job = await engine.enqueue(request({ params: { mockFailuresBeforeSuccess: 99 } }));
    const finished = await waitForState(engine, job.id, ['completed', 'failed']);
    expect(finished.state).toBe('failed');
    expect(finished.error?.code).toBe('NETWORK');
    expect(finished.attempts).toBe(3);
  });

  it('respects maxConcurrent', async () => {
    const { engine } = makeEngine({ maxConcurrent: 1 });
    const running = new Set<string>();
    let peakRunning = 0;
    engine.events.on('job-updated', (job) => {
      if (job.state === 'running') {
        running.add(job.id);
        peakRunning = Math.max(peakRunning, running.size);
      }
      if (['completed', 'failed'].includes(job.state)) running.delete(job.id);
    });

    const jobs = await Promise.all([
      engine.enqueue(request({ params: { mockPollRounds: 3 } })),
      engine.enqueue(request({ params: { mockPollRounds: 3 } })),
      engine.enqueue(request({ params: { mockPollRounds: 3 } })),
    ]);
    await Promise.all(jobs.map((j) => waitForState(engine, j.id, ['completed', 'failed'])));
    expect(peakRunning).toBe(1);
  });

  it('runs higher-priority jobs first', async () => {
    const { engine } = makeEngine({ maxConcurrent: 1 });
    engine.pause();
    const low = await engine.enqueue(request(), { priority: 0 });
    const high = await engine.enqueue(request(), { priority: 10 });

    const completionOrder: string[] = [];
    engine.events.on('job-updated', (job) => {
      if (job.state === 'completed') completionOrder.push(job.id);
    });

    engine.resume();
    await Promise.all([
      waitForState(engine, low.id, ['completed', 'failed']),
      waitForState(engine, high.id, ['completed', 'failed']),
    ]);
    expect(completionOrder).toEqual([high.id, low.id]);
  });

  it('pause stops new work and resume continues it', async () => {
    const { engine } = makeEngine();
    engine.pause();
    const job = await engine.enqueue(request());
    // Give the (paused) engine a beat: the job must remain pending.
    await new Promise((r) => setTimeout(r, 20));
    expect(engine.getJob(job.id)?.state).toBe('pending');
    engine.resume();
    const finished = await waitForState(engine, job.id, ['completed', 'failed']);
    expect(finished.state).toBe('completed');
  });

  it('cancels pending jobs', async () => {
    const { engine } = makeEngine();
    engine.pause();
    const job = await engine.enqueue(request());
    expect(await engine.cancel(job.id)).toBe(true);
    const cancelled = engine.getJob(job.id);
    expect(cancelled?.state).toBe('failed');
    expect(cancelled?.error?.code).toBe('CANCELLED');
  });

  it('cancels running jobs via abort', async () => {
    const { engine } = makeEngine();
    const job = await engine.enqueue(request({ params: { mockPollRounds: 1_000 } }));
    await waitForState(engine, job.id, ['running']);
    expect(await engine.cancel(job.id)).toBe(true);
    const finished = await waitForState(engine, job.id, ['failed']);
    expect(finished.error?.code).toBe('CANCELLED');
  });

  it('marks completed jobs as downloaded', async () => {
    const { engine } = makeEngine();
    const job = await engine.enqueue(request());
    await waitForState(engine, job.id, ['completed']);
    expect(await engine.markDownloaded(job.id)).toBe(true);
    expect(engine.getJob(job.id)?.state).toBe('downloaded');
    // Only completed jobs can be marked.
    expect(await engine.markDownloaded(job.id)).toBe(false);
  });

  it('persists jobs and restores them, resetting interrupted work to pending', async () => {
    const store = new MemoryJobStore();
    const now = Date.now();
    const interrupted: Job = {
      id: 'job_interrupted',
      request: request(),
      state: 'running',
      priority: 0,
      attempts: 1,
      maxAttempts: 3,
      createdAt: now,
      updatedAt: now,
    };
    await store.save(interrupted);

    const { engine } = makeEngine({ store });
    await engine.restore();
    const finished = await waitForState(engine, 'job_interrupted', ['completed', 'failed']);
    expect(finished.state).toBe('completed');
    expect((await store.get('job_interrupted'))?.state).toBe('completed');
  });

  it('removes terminal jobs but refuses to remove active ones', async () => {
    const { engine, store } = makeEngine();
    engine.pause();
    const active = await engine.enqueue(request());
    expect(await engine.remove(active.id)).toBe(false);
    engine.resume();
    await waitForState(engine, active.id, ['completed', 'failed']);
    expect(await engine.remove(active.id)).toBe(true);
    expect(engine.getJob(active.id)).toBeUndefined();
    expect(await store.get(active.id)).toBeUndefined();
  });
});
