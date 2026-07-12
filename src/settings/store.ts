/**
 * Persistence contract for user settings. Unlike jobs/templates/downloads/
 * history, settings use chrome.storage.sync (not IndexedDB) so they follow
 * the user across signed-in browser instances, per the architecture's
 * "Chrome Storage Sync" pairing for this module.
 */

import type { UserSettings } from '@/types/models';

export interface SettingsStore {
  /** Returns only what's been explicitly saved; callers merge with defaults. */
  get(): Promise<Partial<UserSettings> | undefined>;
  set(settings: UserSettings): Promise<void>;
}

/** Volatile store for unit tests and non-extension contexts. */
export class MemorySettingsStore implements SettingsStore {
  #value: Partial<UserSettings> | undefined;

  async get(): Promise<Partial<UserSettings> | undefined> {
    return this.#value ? structuredClone(this.#value) : undefined;
  }

  async set(settings: UserSettings): Promise<void> {
    this.#value = structuredClone(settings);
  }
}
