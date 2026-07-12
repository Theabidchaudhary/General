/**
 * IndexedDB-backed HistoryStore, sharing the single database connection
 * opened by db.ts.
 */

import type { HistoryRecord } from '@/types/models';
import { openDatabase, requestToPromise, STORE_NAMES } from './db';
import type { HistoryStore } from './historyStore';

export class IndexedDbHistoryStore implements HistoryStore {
  async #store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await openDatabase();
    return db.transaction(STORE_NAMES.history, mode).objectStore(STORE_NAMES.history);
  }

  async save(record: HistoryRecord): Promise<void> {
    const store = await this.#store('readwrite');
    await requestToPromise(store.put(record));
  }

  async getAll(): Promise<HistoryRecord[]> {
    const store = await this.#store('readonly');
    return (await requestToPromise(store.getAll())) as HistoryRecord[];
  }

  async delete(id: string): Promise<void> {
    const store = await this.#store('readwrite');
    await requestToPromise(store.delete(id));
  }
}
