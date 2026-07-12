/**
 * Persistence contract for history records, mirroring the other *Store
 * interfaces in this directory.
 */

import type { HistoryRecord } from '@/types/models';

export interface HistoryStore {
  save(record: HistoryRecord): Promise<void>;
  getAll(): Promise<HistoryRecord[]>;
  delete(id: string): Promise<void>;
}

/** Volatile store for unit tests and non-extension contexts. */
export class MemoryHistoryStore implements HistoryStore {
  #records = new Map<string, HistoryRecord>();

  async save(record: HistoryRecord): Promise<void> {
    this.#records.set(record.id, structuredClone(record));
  }

  async getAll(): Promise<HistoryRecord[]> {
    return [...this.#records.values()].map((record) => structuredClone(record));
  }

  async delete(id: string): Promise<void> {
    this.#records.delete(id);
  }
}
