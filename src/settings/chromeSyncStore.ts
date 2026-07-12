/** chrome.storage.sync-backed SettingsStore used by the background service worker. */

import type { UserSettings } from '@/types/models';
import type { SettingsStore } from './store';

const STORAGE_KEY = 'aiwf.settings';

export class ChromeSyncSettingsStore implements SettingsStore {
  async get(): Promise<Partial<UserSettings> | undefined> {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    return result[STORAGE_KEY] as Partial<UserSettings> | undefined;
  }

  async set(settings: UserSettings): Promise<void> {
    await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
  }
}
