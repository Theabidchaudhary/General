/**
 * Scheduler: fires jobs scheduled for a future time, and — via the
 * chrome.alarms heartbeat that drives tick() — durably wakes the MV3
 * service worker so it can resume even after being torn down.
 *
 * The queue engine's own retry/wait timers already reschedule themselves on
 * every worker restart (QueueEngine.restore()), so this module doesn't need
 * to touch retry logic directly — its job is (a) timed jobs, and (b)
 * ensuring *something* wakes the worker periodically so a torn-down worker
 * with a pending retry doesn't sit stuck until some unrelated event happens
 * to revive it. A plain setTimeout cannot survive that teardown; chrome.alarms
 * can, at a minimum 1-minute granularity.
 */

import type { JobRequest, ScheduledJob } from '@/types/models';
import type { ScheduledJobStore } from '@/services/storage/scheduledJobStore';
import { createId } from '@/utils/id';
import { createLogger, type Logger } from '@/utils/logger';

export interface JobSink {
  enqueue(request: JobRequest, options?: { priority?: number }): Promise<unknown>;
}

export class ScheduleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleValidationError';
  }
}

export class Scheduler {
  #queue: JobSink;
  #store: ScheduledJobStore;
  #log: Logger;
  #jobs = new Map<string, ScheduledJob>();

  constructor(queue: JobSink, store: ScheduledJobStore, logger?: Logger) {
    this.#queue = queue;
    this.#store = store;
    this.#log = logger ?? createLogger('scheduler');
  }

  async restore(): Promise<void> {
    const persisted = await this.#store.getAll();
    for (const job of persisted) {
      this.#jobs.set(job.id, job);
    }
    this.#log.info(`Restored ${persisted.length} scheduled job(s) from storage`);
  }

  list(): ScheduledJob[] {
    return [...this.#jobs.values()]
      .sort((a, b) => a.runAt - b.runAt)
      .map((job) => structuredClone(job));
  }

  async schedule(request: JobRequest, runAt: number): Promise<ScheduledJob> {
    if (!Number.isFinite(runAt) || runAt <= Date.now()) {
      throw new ScheduleValidationError('runAt must be a time in the future');
    }
    const job: ScheduledJob = {
      id: createId('sched'),
      request,
      runAt,
      state: 'pending',
      createdAt: Date.now(),
    };
    this.#jobs.set(job.id, job);
    await this.#store.save(job);
    return structuredClone(job);
  }

  async cancel(id: string): Promise<boolean> {
    const job = this.#jobs.get(id);
    if (!job || job.state !== 'pending') return false;
    job.state = 'cancelled';
    await this.#store.save(job);
    return true;
  }

  /** Enqueues every pending job whose runAt has passed. Safe to call repeatedly. */
  async tick(now: number = Date.now()): Promise<ScheduledJob[]> {
    const due = [...this.#jobs.values()].filter((job) => job.state === 'pending' && job.runAt <= now);
    const fired: ScheduledJob[] = [];
    for (const job of due) {
      try {
        await this.#queue.enqueue(job.request);
        job.state = 'fired';
        await this.#store.save(job);
        fired.push(structuredClone(job));
      } catch (error) {
        this.#log.error(`Failed to enqueue scheduled job ${job.id}`, error);
      }
    }
    return fired;
  }
}
