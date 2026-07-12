/**
 * IndexedDB-backed ScheduledJobStore, sharing the single database
 * connection opened by db.ts.
 */

import type { ScheduledJob } from '@/types/models';
import { openDatabase, requestToPromise, STORE_NAMES } from './db';
import type { ScheduledJobStore } from './scheduledJobStore';

export class IndexedDbScheduledJobStore implements ScheduledJobStore {
  async #store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await openDatabase();
    return db.transaction(STORE_NAMES.scheduledJobs, mode).objectStore(STORE_NAMES.scheduledJobs);
  }

  async save(job: ScheduledJob): Promise<void> {
    const store = await this.#store('readwrite');
    await requestToPromise(store.put(job));
  }

  async getAll(): Promise<ScheduledJob[]> {
    const store = await this.#store('readonly');
    return (await requestToPromise(store.getAll())) as ScheduledJob[];
  }

  async delete(id: string): Promise<void> {
    const store = await this.#store('readwrite');
    await requestToPromise(store.delete(id));
  }
}
