/**
 * Queue engine: schedules generation jobs against provider adapters.
 *
 * Responsibilities
 *  - State machine: pending → validating → running → (waiting | retrying)*
 *    → completed → downloaded, with failed as the terminal error state.
 *  - Configurable concurrency with priority ordering (higher first, FIFO ties).
 *  - Retry with exponential backoff for retryable provider errors; rate-limit
 *    responses park the job in 'waiting' until the provider-suggested time.
 *  - Persistence of every transition through a JobStore so the queue can be
 *    restored after a browser or service-worker restart.
 *  - Pause/resume: pausing stops new work from starting; in-flight jobs finish.
 *
 * The engine is UI-agnostic and provider-agnostic: it talks only to the
 * ProviderRegistry, the JobStore, and its event emitter.
 */

import type { Job, JobRequest, QueueItem } from '@/types/models';
import type { ProviderRegistry } from '@/providers/registry';
import { normalizeError, ProviderError } from '@/providers/types';
import type { JobStore } from '@/services/storage/jobStore';
import { computeBackoffMs, DEFAULT_BACKOFF, type BackoffPolicy } from '@/utils/backoff';
import { Emitter } from '@/utils/emitter';
import { createId } from '@/utils/id';
import { createLogger, type Logger } from '@/utils/logger';

export interface QueueEngineOptions {
  store: JobStore;
  registry: ProviderRegistry;
  logger?: Logger;
  maxConcurrent?: number;
  maxAttempts?: number;
  backoff?: BackoffPolicy;
  pollIntervalMs?: number;
}

export interface QueueEvents extends Record<string, unknown> {
  /** Fires on every job state transition with a snapshot of the job. */
  'job-updated': Job;
}

export interface EnqueueOptions {
  priority?: number;
  maxAttempts?: number;
}

const ACTIVE_STATES = new Set<Job['state']>(['pending', 'validating', 'running', 'waiting', 'retrying']);

export class QueueEngine {
  readonly events = new Emitter<QueueEvents>();

  #store: JobStore;
  #registry: ProviderRegistry;
  #log: Logger;
  #backoff: BackoffPolicy;
  #pollIntervalMs: number;
  #defaultMaxAttempts: number;
  #maxConcurrent: number;

  #jobs = new Map<string, Job>();
  #inFlight = new Map<string, AbortController>();
  #timers = new Map<string, ReturnType<typeof setTimeout>>();
  #paused = false;

  constructor(options: QueueEngineOptions) {
    this.#store = options.store;
    this.#registry = options.registry;
    this.#log = options.logger ?? createLogger('queue');
    this.#backoff = options.backoff ?? DEFAULT_BACKOFF;
    this.#pollIntervalMs = options.pollIntervalMs ?? 2_000;
    this.#defaultMaxAttempts = options.maxAttempts ?? 3;
    this.#maxConcurrent = options.maxConcurrent ?? 2;
  }

  /**
   * Loads persisted jobs. Jobs interrupted mid-flight (validating/running)
   * are reset to pending so the work is retried rather than lost.
   */
  async restore(): Promise<void> {
    const persisted = await this.#store.getAll();
    for (const job of persisted) {
      if (job.state === 'validating' || job.state === 'running') {
        job.state = 'pending';
        delete job.nextAttemptAt;
        await this.#store.save(job);
      }
      this.#jobs.set(job.id, job);
      if (job.state === 'retrying' || job.state === 'waiting') {
        this.#scheduleWakeup(job);
      }
    }
    this.#log.info(`Restored ${persisted.length} job(s) from storage`);
    this.#pump();
  }

  async enqueue(request: JobRequest, options: EnqueueOptions = {}): Promise<Job> {
    const now = Date.now();
    const job: Job = {
      id: createId('job'),
      request,
      state: 'pending',
      priority: options.priority ?? 0,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? this.#defaultMaxAttempts,
      createdAt: now,
      updatedAt: now,
    };
    this.#jobs.set(job.id, job);
    await this.#persist(job);
    this.#log.info(`Enqueued job ${job.id} for provider '${request.providerId}'`);
    this.#pump();
    return structuredClone(job);
  }

  pause(): void {
    this.#paused = true;
    this.#log.info('Queue paused');
  }

  resume(): void {
    if (!this.#paused) return;
    this.#paused = false;
    this.#log.info('Queue resumed');
    this.#pump();
  }

  get paused(): boolean {
    return this.#paused;
  }

  setMaxConcurrent(value: number): void {
    this.#maxConcurrent = Math.max(1, Math.floor(value));
    this.#pump();
  }

  get maxConcurrent(): number {
    return this.#maxConcurrent;
  }

  /** Default retry budget applied to jobs enqueued from now on; existing jobs keep theirs. */
  setDefaultMaxAttempts(value: number): void {
    this.#defaultMaxAttempts = Math.max(1, Math.floor(value));
  }

  get defaultMaxAttempts(): number {
    return this.#defaultMaxAttempts;
  }

  listJobs(): Job[] {
    return [...this.#jobs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((job) => structuredClone(job));
  }

  getJob(id: string): Job | undefined {
    const job = this.#jobs.get(id);
    return job ? structuredClone(job) : undefined;
  }

  /** Pending/scheduled work in the order it will run. */
  listQueue(): QueueItem[] {
    return this.#eligibleOrder(Number.POSITIVE_INFINITY).map((job, index) => ({
      jobId: job.id,
      state: job.state,
      priority: job.priority,
      position: index,
    }));
  }

  async cancel(jobId: string): Promise<boolean> {
    const job = this.#jobs.get(jobId);
    if (!job || !ACTIVE_STATES.has(job.state)) return false;

    const timer = this.#timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.#timers.delete(jobId);
    }

    const controller = this.#inFlight.get(jobId);
    if (controller) {
      controller.abort();
      if (job.submission) {
        try {
          await this.#registry.get(job.request.providerId).cancel(job.submission);
        } catch (error) {
          this.#log.warn(`Provider-side cancel failed for ${jobId}`, error);
        }
      }
      // The in-flight runner observes the abort and finalizes the job itself.
      return true;
    }

    job.error = { code: 'CANCELLED', message: 'Cancelled by user', retryable: false };
    await this.#transition(job, 'failed');
    return true;
  }

  /** Marks a completed job as downloaded (called by the download manager). */
  async markDownloaded(jobId: string): Promise<boolean> {
    const job = this.#jobs.get(jobId);
    if (!job || job.state !== 'completed') return false;
    await this.#transition(job, 'downloaded');
    return true;
  }

  /** Removes a terminal job from the queue and storage. */
  async remove(jobId: string): Promise<boolean> {
    const job = this.#jobs.get(jobId);
    if (!job || ACTIVE_STATES.has(job.state)) return false;
    this.#jobs.delete(jobId);
    await this.#store.delete(jobId);
    return true;
  }

  // ---------------------------------------------------------------- internals

  async #persist(job: Job): Promise<void> {
    job.updatedAt = Date.now();
    await this.#store.save(job);
    this.events.emit('job-updated', structuredClone(job));
  }

  async #transition(job: Job, state: Job['state']): Promise<void> {
    job.state = state;
    if (state === 'completed' || state === 'failed') job.completedAt = Date.now();
    await this.#persist(job);
  }

  #eligibleOrder(limit: number): Job[] {
    const now = Date.now();
    return [...this.#jobs.values()]
      .filter(
        (job) =>
          (job.state === 'pending' ||
            ((job.state === 'retrying' || job.state === 'waiting') &&
              (job.nextAttemptAt ?? 0) <= now)) &&
          !this.#inFlight.has(job.id),
      )
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
      .slice(0, limit);
  }

  #pump(): void {
    if (this.#paused) return;
    const capacity = this.#maxConcurrent - this.#inFlight.size;
    if (capacity <= 0) return;
    for (const job of this.#eligibleOrder(capacity)) {
      void this.#run(job);
    }
  }

  #scheduleWakeup(job: Job): void {
    const delay = Math.max(0, (job.nextAttemptAt ?? 0) - Date.now());
    const existing = this.#timers.get(job.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.#timers.delete(job.id);
      // setTimeout guarantees firing no earlier than `delay`, but timer/clock
      // granularity can still leave Date.now() a hair below nextAttemptAt
      // when the callback runs. #pump()'s eligibility check would then skip
      // this job, and since nothing else re-checks it, it would be stranded
      // in 'retrying'/'waiting' forever. Self-heal by rescheduling instead.
      if ((job.nextAttemptAt ?? 0) > Date.now()) {
        this.#scheduleWakeup(job);
        return;
      }
      this.#pump();
    }, delay);
    this.#timers.set(job.id, timer);
  }

  async #run(job: Job): Promise<void> {
    const controller = new AbortController();
    this.#inFlight.set(job.id, controller);
    try {
      const provider = this.#registry.get(job.request.providerId);

      await this.#transition(job, 'validating');
      await provider.validate(job.request);

      job.attempts += 1;
      job.startedAt ??= Date.now();
      await this.#transition(job, 'running');

      job.submission = await provider.submit(job.request, controller.signal);
      await this.#persist(job);

      // Poll until the provider reports a terminal status.
      for (;;) {
        const result = await provider.poll(job.submission, controller.signal);
        if (result.status === 'succeeded') break;
        if (result.status === 'failed') {
          throw new ProviderError(result.error.code, result.error.message, {
            retryable: result.error.retryable,
            ...(result.error.retryAfterMs !== undefined
              ? { retryAfterMs: result.error.retryAfterMs }
              : {}),
          });
        }
        await this.#delay(this.#pollIntervalMs, controller.signal);
      }

      job.outputs = await provider.resolveDownloads(job.submission, controller.signal);
      delete job.error;
      await this.#transition(job, 'completed');
      this.#log.info(`Job ${job.id} completed after ${job.attempts} attempt(s)`);
    } catch (error) {
      await this.#handleFailure(job, error, controller.signal.aborted);
    } finally {
      this.#inFlight.delete(job.id);
      this.#pump();
    }
  }

  async #handleFailure(job: Job, error: unknown, aborted: boolean): Promise<void> {
    const normalized = aborted
      ? { code: 'CANCELLED' as const, message: 'Cancelled by user', retryable: false }
      : normalizeError(error);
    job.error = normalized;

    const attemptsExhausted = job.attempts >= job.maxAttempts;
    if (!normalized.retryable || attemptsExhausted) {
      await this.#transition(job, 'failed');
      this.#log.warn(`Job ${job.id} failed (${normalized.code}): ${normalized.message}`);
      return;
    }

    // Rate limits wait for the provider-specified window; other retryable
    // errors use exponential backoff on the attempt count.
    const isRateLimit = normalized.code === 'RATE_LIMITED';
    const delayMs = isRateLimit
      ? (normalized.retryAfterMs ?? computeBackoffMs(job.attempts, this.#backoff))
      : computeBackoffMs(job.attempts, this.#backoff);
    job.nextAttemptAt = Date.now() + delayMs;
    await this.#transition(job, isRateLimit ? 'waiting' : 'retrying');
    this.#log.info(
      `Job ${job.id} ${isRateLimit ? 'waiting' : 'retrying'} in ${delayMs}ms (attempt ${job.attempts}/${job.maxAttempts})`,
    );
    this.#scheduleWakeup(job);
  }

  #delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new ProviderError('CANCELLED', 'Operation aborted'));
        return;
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new ProviderError('CANCELLED', 'Operation aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
