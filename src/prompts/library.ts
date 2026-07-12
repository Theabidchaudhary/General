/**
 * Prompt library: CRUD over prompt templates with validation. The queue
 * engine and message bus depend on this service, not on TemplateStore
 * directly, so validation rules live in one place.
 */

import type { MediaKind, PromptTemplate } from '@/types/models';
import type { TemplateStore } from '@/services/storage/templateStore';
import { createId } from '@/utils/id';
import { extractVariables } from './variables';

export interface SaveTemplateInput {
  id?: string;
  name: string;
  body: string;
  kind: MediaKind;
  tags?: string[];
}

export class TemplateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateValidationError';
  }
}

export class PromptLibrary {
  #store: TemplateStore;
  #lastTimestamp = 0;

  constructor(store: TemplateStore) {
    this.#store = store;
  }

  /**
   * Monotonically increasing timestamp so rapid saves (well within
   * Date.now()'s millisecond resolution) still sort deterministically by
   * recency instead of tying.
   */
  #now(): number {
    const now = Math.max(Date.now(), this.#lastTimestamp + 1);
    this.#lastTimestamp = now;
    return now;
  }

  async list(): Promise<PromptTemplate[]> {
    const templates = await this.#store.getAll();
    return templates.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<PromptTemplate | undefined> {
    return this.#store.get(id);
  }

  /** Creates a new template, or updates an existing one when `id` is provided. */
  async save(input: SaveTemplateInput): Promise<PromptTemplate> {
    const name = input.name.trim();
    const body = input.body.trim();
    if (!name) throw new TemplateValidationError('Template name must not be empty');
    if (!body) throw new TemplateValidationError('Template body must not be empty');

    const now = this.#now();
    const variables = extractVariables(body);
    const tags = [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))];

    if (input.id) {
      const existing = await this.#store.get(input.id);
      if (!existing) {
        throw new TemplateValidationError(`Template '${input.id}' does not exist`);
      }
      const updated: PromptTemplate = {
        ...existing,
        name,
        body,
        kind: input.kind,
        tags,
        variables,
        updatedAt: now,
      };
      await this.#store.save(updated);
      return updated;
    }

    const created: PromptTemplate = {
      id: createId('tpl'),
      name,
      body,
      kind: input.kind,
      tags,
      variables,
      createdAt: now,
      updatedAt: now,
    };
    await this.#store.save(created);
    return created;
  }

  async delete(id: string): Promise<void> {
    await this.#store.delete(id);
  }
}
