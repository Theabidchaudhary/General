/**
 * Background service worker entry point.
 *
 * Wires together the provider registry, the persistent queue engine, and the
 * message router, and opens the side panel from the toolbar action.
 */

import { AnalyticsService } from '@/analytics/service';
import { ChromeDownloadDriver } from '@/downloads/chromeDriver';
import { DownloadManager } from '@/downloads/manager';
import { HistoryService } from '@/history/service';
import { PromptLibrary } from '@/prompts/library';
import { MockProvider } from '@/providers/mock/mockProvider';
import { ProviderRegistry } from '@/providers/registry';
import { BatchEngine } from '@/queue/batch';
import { QueueEngine } from '@/queue/engine';
import { createMessageRouter } from '@/services/messaging/bus';
import { IndexedDbDownloadStore } from '@/services/storage/indexedDbDownloadStore';
import { IndexedDbHistoryStore } from '@/services/storage/indexedDbHistoryStore';
import { IndexedDbJobStore } from '@/services/storage/indexedDbJobStore';
import { IndexedDbTemplateStore } from '@/services/storage/indexedDbTemplateStore';
import { ChromeSyncSettingsStore } from '@/settings/chromeSyncStore';
import { SettingsService } from '@/settings/service';
import { DEFAULT_SETTINGS, type UserSettings } from '@/types/models';
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

const library = new PromptLibrary(new IndexedDbTemplateStore());
const batchEngine = new BatchEngine(queue);

const downloadManager = new DownloadManager({
  queue,
  driver: new ChromeDownloadDriver(),
  store: new IndexedDbDownloadStore(),
  logger: log.child('downloads'),
  subfolder: DEFAULT_SETTINGS.downloadSubfolder,
  autoDownload: DEFAULT_SETTINGS.autoDownload,
});

const historyService = new HistoryService(queue, new IndexedDbHistoryStore(), log.child('history'));
const analyticsService = new AnalyticsService(historyService);

const settingsService = new SettingsService(new ChromeSyncSettingsStore());

function applySettings(settings: UserSettings): void {
  queue.setMaxConcurrent(settings.maxConcurrentJobs);
  queue.setDefaultMaxAttempts(settings.maxAttempts);
  downloadManager.setAutoDownload(settings.autoDownload);
  downloadManager.setSubfolder(settings.downloadSubfolder);
}
settingsService.events.on('settings-changed', applySettings);

const ready = queue.restore().catch((error) => {
  log.error('Failed to restore queue from storage', error);
});
const downloadsReady = downloadManager.restore().catch((error) => {
  log.error('Failed to restore downloads from storage', error);
});
const historyReady = historyService.restore().catch((error) => {
  log.error('Failed to restore history from storage', error);
});
const settingsReady = settingsService
  .restore()
  .then((settings) => {
    applySettings(settings);
    return settings;
  })
  .catch((error) => {
    log.error('Failed to restore settings from storage', error);
    return DEFAULT_SETTINGS;
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
  'prompts/list': async () => ({ templates: await library.list() }),
  'prompts/save': async ({ input }) => ({ template: await library.save(input) }),
  'prompts/delete': async ({ id }) => {
    await library.delete(id);
    return { deleted: true };
  },
  'batch/submit': async ({ input }) => {
    await ready;
    return batchEngine.submit(input);
  },
  'downloads/list': async () => {
    await downloadsReady;
    return { tasks: downloadManager.listTasks() };
  },
  'downloads/start': async ({ jobId }) => {
    await Promise.all([ready, downloadsReady]);
    return { tasks: await downloadManager.downloadJob(jobId) };
  },
  'downloads/retry': async ({ taskId }) => {
    await downloadsReady;
    return { task: await downloadManager.retry(taskId) };
  },
  'history/list': async ({ query }) => {
    await historyReady;
    return { records: historyService.list(query) };
  },
  'analytics/snapshot': async () => {
    await historyReady;
    return { snapshot: analyticsService.computeSnapshot() };
  },
  'settings/get': async () => {
    await settingsReady;
    return { settings: settingsService.get() };
  },
  'settings/update': async ({ patch }) => {
    await settingsReady;
    return { settings: await settingsService.update(patch) };
  },
  'logs/recent': async ({ limit }) => ({ entries: getRecentLogs(limit) }),
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) {
    void chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

log.info('Background service worker initialized');
