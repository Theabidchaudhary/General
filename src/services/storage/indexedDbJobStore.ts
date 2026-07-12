/**
 * IndexedDB-backed JobStore used in the background service worker so the
 * queue survives browser restarts and service-worker teardown.
 */

import type { Job } from '@/types/models';
import { openDatabase, requestToPromise, STORE_NAMES } from './db';
import type { JobStore } from './jobStore';

export class IndexedDbJobStore implements JobStore {
  async #store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await openDatabase();
    return db.transaction(STORE_NAMES.jobs, mode).objectStore(STORE_NAMES.jobs);
  }

  async save(job: Job): Promise<void> {
    const store = await this.#store('readwrite');
    await requestToPromise(store.put(job));
  }

  async get(id: string): Promise<Job | undefined> {
    const store = await this.#store('readonly');
    return (await requestToPromise(store.get(id))) as Job | undefined;
  }

  async getAll(): Promise<Job[]> {
    const store = await this.#store('readonly');
    return (await requestToPromise(store.getAll())) as Job[];
  }

  async delete(id: string): Promise<void> {
    const store = await this.#store('readwrite');
    await requestToPromise(store.delete(id));
  }

  async clear(): Promise<void> {
    const store = await this.#store('readwrite');
    await requestToPromise(store.clear());
  }
}
