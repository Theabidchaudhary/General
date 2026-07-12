import { describe, expect, it } from 'vitest';
import type { DownloadTarget } from '@/types/models';
import type { DownloadDriverEvent } from './driver';
import { MockDownloadDriver } from './mockDriver';

function target(overrides: Partial<DownloadTarget> = {}): DownloadTarget {
  return { url: 'https://mock.invalid/a', filename: 'a.png', kind: 'image', ...overrides };
}

function collectEvents(driver: MockDownloadDriver, handle: () => string): Promise<DownloadDriverEvent[]> {
  return new Promise((resolve) => {
    const events: DownloadDriverEvent[] = [];
    const off = driver.onEvent((event) => {
      if (event.handle !== handle()) return;
      events.push(event);
      if (event.type === 'completed' || event.type === 'failed') {
        off();
        resolve(events);
      }
    });
  });
}

describe('MockDownloadDriver', () => {
  it('emits progress then completed for a normal target', async () => {
    const driver = new MockDownloadDriver();
    let h = '';
    const events = collectEvents(driver, () => h);
    h = await driver.start(target(), 'a.png');
    const seen = await events;
    expect(seen.map((e) => e.type)).toEqual(['progress', 'completed']);
  });

  it('fails every attempt for fail-always targets', async () => {
    const driver = new MockDownloadDriver();
    let h = '';
    const events = collectEvents(driver, () => h);
    h = await driver.start(target({ filename: 'fail-always:a.png' }), 'a.png');
    const seen = await events;
    expect(seen.at(-1)?.type).toBe('failed');
  });

  it('fails only the first attempt for a given url with fail-once targets', async () => {
    const driver = new MockDownloadDriver();
    const t = target({ filename: 'fail-once:a.png' });

    let h1 = '';
    const first = collectEvents(driver, () => h1);
    h1 = await driver.start(t, 'a.png');
    expect((await first).at(-1)?.type).toBe('failed');

    let h2 = '';
    const second = collectEvents(driver, () => h2);
    h2 = await driver.start(t, 'a.png');
    expect((await second).at(-1)?.type).toBe('completed');
  });

  it('suppresses events after cancel', async () => {
    const driver = new MockDownloadDriver();
    const seen: DownloadDriverEvent[] = [];
    driver.onEvent((event) => seen.push(event));
    const handle = await driver.start(target(), 'a.png');
    await driver.cancel(handle);
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toHaveLength(0);
  });
});
