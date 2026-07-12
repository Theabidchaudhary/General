/**
 * Settings service: merges persisted overrides with DEFAULT_SETTINGS,
 * clamps values that other engines rely on as invariants (concurrency and
 * retry budgets must stay >= 1), and notifies subscribers on every change so
 * the background worker can push updates into the queue/downloads/
 * notifications subsystems live.
 */

import { DEFAULT_SETTINGS, type UserSettings } from '@/types/models';
import { Emitter } from '@/utils/emitter';
import type { SettingsStore } from './store';

export interface SettingsEvents extends Record<string, unknown> {
  'settings-changed': UserSettings;
}

const VALID_THEMES = new Set<UserSettings['theme']>(['system', 'light', 'dark']);

/** Matches QueueEngine's own clamping (Math.max(1, ...)) so a value that passes through both stays the same. */
function clampPositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function sanitize(settings: UserSettings): UserSettings {
  return {
    ...settings,
    maxConcurrentJobs: clampPositiveInt(settings.maxConcurrentJobs, DEFAULT_SETTINGS.maxConcurrentJobs),
    maxAttempts: clampPositiveInt(settings.maxAttempts, DEFAULT_SETTINGS.maxAttempts),
    theme: VALID_THEMES.has(settings.theme) ? settings.theme : DEFAULT_SETTINGS.theme,
  };
}

export class SettingsService {
  readonly events = new Emitter<SettingsEvents>();
  #store: SettingsStore;
  #current: UserSettings = DEFAULT_SETTINGS;

  constructor(store: SettingsStore) {
    this.#store = store;
  }

  async restore(): Promise<UserSettings> {
    const stored = await this.#store.get();
    this.#current = sanitize({ ...DEFAULT_SETTINGS, ...stored });
    return this.get();
  }

  get(): UserSettings {
    return structuredClone(this.#current);
  }

  async update(patch: Partial<UserSettings>): Promise<UserSettings> {
    this.#current = sanitize({ ...this.#current, ...patch });
    await this.#store.set(this.#current);
    this.events.emit('settings-changed', this.get());
    return this.get();
  }
}
