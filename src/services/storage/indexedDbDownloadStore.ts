/**
 * IndexedDB-backed DownloadStore, sharing the single database connection
 * opened by db.ts.
 */

import type { DownloadTask } from '@/types/models';
import { openDatabase, requestToPromise, STORE_NAMES } from './db';
import type { DownloadStore } from './downloadStore';

export class IndexedDbDownloadStore implements DownloadStore {
  async #store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await openDatabase();
    return db.transaction(STORE_NAMES.downloads, mode).objectStore(STORE_NAMES.downloads);
  }

  async save(task: DownloadTask): Promise<void> {
    const store = await this.#store('readwrite');
    await requestToPromise(store.put(task));
  }

  async get(id: string): Promise<DownloadTask | undefined> {
    const store = await this.#store('readonly');
    return (await requestToPromise(store.get(id))) as DownloadTask | undefined;
  }

  async getAll(): Promise<DownloadTask[]> {
    const store = await this.#store('readonly');
    return (await requestToPromise(store.getAll())) as DownloadTask[];
  }

  async delete(id: string): Promise<void> {
    const store = await this.#store('readwrite');
    await requestToPromise(store.delete(id));
  }
}
