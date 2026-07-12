import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/types/models';
import { MemorySettingsStore } from './store';
import { SettingsService } from './service';

describe('SettingsService', () => {
  it('starts with defaults before restore', () => {
    const service = new SettingsService(new MemorySettingsStore());
    expect(service.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges persisted overrides with defaults on restore', async () => {
    const store = new MemorySettingsStore();
    await store.set({ ...DEFAULT_SETTINGS, maxConcurrentJobs: 5, theme: 'dark' });
    const service = new SettingsService(store);
    const settings = await service.restore();
    expect(settings.maxConcurrentJobs).toBe(5);
    expect(settings.theme).toBe('dark');
    expect(settings.downloadSubfolder).toBe(DEFAULT_SETTINGS.downloadSubfolder);
  });

  it('persists updates and emits settings-changed', async () => {
    const store = new MemorySettingsStore();
    const service = new SettingsService(store);
    await service.restore();

    let emitted: unknown;
    service.events.on('settings-changed', (settings) => {
      emitted = settings;
    });

    const updated = await service.update({ autoDownload: true });
    expect(updated.autoDownload).toBe(true);
    expect(emitted).toEqual(updated);
    expect((await store.get())?.autoDownload).toBe(true);
  });

  it('clamps maxConcurrentJobs and maxAttempts to at least 1', async () => {
    const service = new SettingsService(new MemorySettingsStore());
    await service.restore();
    const updated = await service.update({ maxConcurrentJobs: 0, maxAttempts: -5 });
    expect(updated.maxConcurrentJobs).toBe(1);
    expect(updated.maxAttempts).toBe(1);
  });

  it('falls back to a valid theme when given garbage', async () => {
    const service = new SettingsService(new MemorySettingsStore());
    await service.restore();
    // @ts-expect-error deliberately invalid to exercise the sanitizer
    const updated = await service.update({ theme: 'purple' });
    expect(updated.theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it('get() returns a copy, not a live reference', async () => {
    const service = new SettingsService(new MemorySettingsStore());
    await service.restore();
    const snapshot = service.get();
    snapshot.maxConcurrentJobs = 999;
    expect(service.get().maxConcurrentJobs).toBe(DEFAULT_SETTINGS.maxConcurrentJobs);
  });
});
