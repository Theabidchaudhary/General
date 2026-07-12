/**
 * Persistence contract for prompt templates, mirroring JobStore's shape so
 * the prompt library can be tested against a memory store while the
 * background worker uses IndexedDB.
 */

import type { PromptTemplate } from '@/types/models';

export interface TemplateStore {
  save(template: PromptTemplate): Promise<void>;
  get(id: string): Promise<PromptTemplate | undefined>;
  getAll(): Promise<PromptTemplate[]>;
  delete(id: string): Promise<void>;
}

/** Volatile store for unit tests and non-extension contexts. */
export class MemoryTemplateStore implements TemplateStore {
  #templates = new Map<string, PromptTemplate>();

  async save(template: PromptTemplate): Promise<void> {
    this.#templates.set(template.id, structuredClone(template));
  }

  async get(id: string): Promise<PromptTemplate | undefined> {
    const template = this.#templates.get(id);
    return template ? structuredClone(template) : undefined;
  }

  async getAll(): Promise<PromptTemplate[]> {
    return [...this.#templates.values()].map((template) => structuredClone(template));
  }

  async delete(id: string): Promise<void> {
    this.#templates.delete(id);
  }
}
