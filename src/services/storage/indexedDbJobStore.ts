/**
 * IndexedDB-backed JobStore used in the background service worker so the
 * queue survives browser restarts and service-worker teardown.
 */

import type { Job } from '@/types/models';
import type { JobStore } from './jobStore';

const DB_NAME = 'ai-workflow-studio';
const DB_VERSION = 1;
const STORE_NAME = 'jobs';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export class IndexedDbJobStore implements JobStore {
  #db: Promise<IDBDatabase> | undefined;

  #database(): Promise<IDBDatabase> {
    this.#db ??= openDatabase();
    return this.#db;
  }

  async #store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.#database();
    return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
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
