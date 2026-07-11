/**
 * Background service worker entry point.
 *
 * Wires together the provider registry, the persistent queue engine, and the
 * message router, and opens the side panel from the toolbar action.
 */

import { MockProvider } from '@/providers/mock/mockProvider';
import { ProviderRegistry } from '@/providers/registry';
import { QueueEngine } from '@/queue/engine';
import { createMessageRouter } from '@/services/messaging/bus';
import { IndexedDbJobStore } from '@/services/storage/indexedDbJobStore';
import { DEFAULT_SETTINGS } from '@/types/models';
import { createLogger, getRecentLogs } from '@/utils/logger';

const log = createLogger('background');

const registry = new ProviderRegistry();
registry.register(new MockProvider());

const queue = new QueueEngine({
  store: new IndexedDbJobStore(),
  registry,
  logger: log.child('queue'),
  maxConcurrent: DEFAULT_SETTINGS.maxConcurrentJobs,
  maxAttempts: DEFAULT_SETTINGS.maxAttempts,
});

const ready = queue.restore().catch((error) => {
  log.error('Failed to restore queue from storage', error);
});

createMessageRouter({
  'queue/enqueue': async ({ request, priority }) => {
    await ready;
    const job = await queue.enqueue(request, priority !== undefined ? { priority } : {});
    return { job };
  },
  'queue/list': async () => {
    await ready;
    return { jobs: queue.listJobs(), paused: queue.paused, maxConcurrent: queue.maxConcurrent };
  },
  'queue/order': async () => {
    await ready;
    return { items: queue.listQueue() };
  },
  'queue/pause': async () => {
    queue.pause();
    return { paused: queue.paused };
  },
  'queue/resume': async () => {
    queue.resume();
    return { paused: queue.paused };
  },
  'queue/cancel': async ({ jobId }) => ({ cancelled: await queue.cancel(jobId) }),
  'queue/remove': async ({ jobId }) => ({ removed: await queue.remove(jobId) }),
  'queue/set-concurrency': async ({ maxConcurrent }) => {
    queue.setMaxConcurrent(maxConcurrent);
    return { maxConcurrent: queue.maxConcurrent };
  },
  'queue/mark-downloaded': async ({ jobId }) => ({ marked: await queue.markDownloaded(jobId) }),
  'providers/list': async () => ({ providers: await registry.describeAll() }),
  'logs/recent': async ({ limit }) => ({ entries: getRecentLogs(limit) }),
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) {
    void chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

log.info('Background service worker initialized');
