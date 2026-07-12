/**
 * Persistence contract for download tasks, mirroring JobStore/TemplateStore.
 */

import type { DownloadTask } from '@/types/models';

export interface DownloadStore {
  save(task: DownloadTask): Promise<void>;
  get(id: string): Promise<DownloadTask | undefined>;
  getAll(): Promise<DownloadTask[]>;
  delete(id: string): Promise<void>;
}

/** Volatile store for unit tests and non-extension contexts. */
export class MemoryDownloadStore implements DownloadStore {
  #tasks = new Map<string, DownloadTask>();

  async save(task: DownloadTask): Promise<void> {
    this.#tasks.set(task.id, structuredClone(task));
  }

  async get(id: string): Promise<DownloadTask | undefined> {
    const task = this.#tasks.get(id);
    return task ? structuredClone(task) : undefined;
  }

  async getAll(): Promise<DownloadTask[]> {
    return [...this.#tasks.values()].map((task) => structuredClone(task));
  }

  async delete(id: string): Promise<void> {
    this.#tasks.delete(id);
  }
}
