/**
 * IndexedDB-backed TemplateStore, sharing the single database connection
 * opened by db.ts.
 */

import type { PromptTemplate } from '@/types/models';
import { openDatabase, requestToPromise, STORE_NAMES } from './db';
import type { TemplateStore } from './templateStore';

export class IndexedDbTemplateStore implements TemplateStore {
  async #store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await openDatabase();
    return db.transaction(STORE_NAMES.templates, mode).objectStore(STORE_NAMES.templates);
  }

  async save(template: PromptTemplate): Promise<void> {
    const store = await this.#store('readwrite');
    await requestToPromise(store.put(template));
  }

  async get(id: string): Promise<PromptTemplate | undefined> {
    const store = await this.#store('readonly');
    return (await requestToPromise(store.get(id))) as PromptTemplate | undefined;
  }

  async getAll(): Promise<PromptTemplate[]> {
    const store = await this.#store('readonly');
    return (await requestToPromise(store.getAll())) as PromptTemplate[];
  }

  async delete(id: string): Promise<void> {
    const store = await this.#store('readwrite');
    await requestToPromise(store.delete(id));
  }
}
