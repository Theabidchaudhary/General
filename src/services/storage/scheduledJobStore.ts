/**
 * Persistence contract for scheduled jobs, mirroring the other *Store
 * interfaces in this directory.
 */

import type { ScheduledJob } from '@/types/models';

export interface ScheduledJobStore {
  save(job: ScheduledJob): Promise<void>;
  getAll(): Promise<ScheduledJob[]>;
  delete(id: string): Promise<void>;
}

/** Volatile store for unit tests and non-extension contexts. */
export class MemoryScheduledJobStore implements ScheduledJobStore {
  #jobs = new Map<string, ScheduledJob>();

  async save(job: ScheduledJob): Promise<void> {
    this.#jobs.set(job.id, structuredClone(job));
  }

  async getAll(): Promise<ScheduledJob[]> {
    return [...this.#jobs.values()].map((job) => structuredClone(job));
  }

  async delete(id: string): Promise<void> {
    this.#jobs.delete(id);
  }
}
