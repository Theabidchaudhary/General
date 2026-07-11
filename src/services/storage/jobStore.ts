/**
 * Persistence contract for queue jobs. The queue engine depends on this
 * interface only; the background worker wires in IndexedDbJobStore while
 * tests use MemoryJobStore.
 */

import type { Job } from '@/types/models';

export interface JobStore {
  save(job: Job): Promise<void>;
  get(id: string): Promise<Job | undefined>;
  getAll(): Promise<Job[]>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

/** Volatile store for unit tests and non-extension contexts. */
export class MemoryJobStore implements JobStore {
  #jobs = new Map<string, Job>();

  async save(job: Job): Promise<void> {
    // Deep-copy so callers can't mutate persisted state in place.
    this.#jobs.set(job.id, structuredClone(job));
  }

  async get(id: string): Promise<Job | undefined> {
    const job = this.#jobs.get(id);
    return job ? structuredClone(job) : undefined;
  }

  async getAll(): Promise<Job[]> {
    return [...this.#jobs.values()].map((job) => structuredClone(job));
  }

  async delete(id: string): Promise<void> {
    this.#jobs.delete(id);
  }

  async clear(): Promise<void> {
    this.#jobs.clear();
  }
}
