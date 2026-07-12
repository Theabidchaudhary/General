/**
 * Typed message contract between extension contexts (side panel, content
 * scripts) and the background service worker. Adding a message means adding
 * an entry here; both ends get compile-time checking from the same map.
 */

import type {
  AnalyticsSnapshot,
  DownloadTask,
  HistoryRecord,
  Job,
  JobRequest,
  PromptTemplate,
  QueueItem,
  ScheduledJob,
  UserSettings,
} from '@/types/models';
import type { ProviderDescriptor } from '@/providers/types';
import type { SaveTemplateInput } from '@/prompts/library';
import type { BatchInput, BatchResult } from '@/queue/batch';
import type { HistoryQuery } from '@/history/service';
import type { ExportBundle, ImportSummary } from '@/importExport/service';
import type { LogEntry } from '@/utils/logger';

export interface MessageMap {
  'queue/enqueue': {
    request: { request: JobRequest; priority?: number };
    response: { job: Job };
  };
  'queue/list': {
    request: Record<string, never>;
    response: { jobs: Job[]; paused: boolean; maxConcurrent: number };
  };
  'queue/order': {
    request: Record<string, never>;
    response: { items: QueueItem[] };
  };
  'queue/pause': {
    request: Record<string, never>;
    response: { paused: boolean };
  };
  'queue/resume': {
    request: Record<string, never>;
    response: { paused: boolean };
  };
  'queue/cancel': {
    request: { jobId: string };
    response: { cancelled: boolean };
  };
  'queue/remove': {
    request: { jobId: string };
    response: { removed: boolean };
  };
  'queue/set-concurrency': {
    request: { maxConcurrent: number };
    response: { maxConcurrent: number };
  };
  'queue/mark-downloaded': {
    request: { jobId: string };
    response: { marked: boolean };
  };
  'providers/list': {
    request: Record<string, never>;
    response: { providers: ProviderDescriptor[] };
  };
  'prompts/list': {
    request: Record<string, never>;
    response: { templates: PromptTemplate[] };
  };
  'prompts/save': {
    request: { input: SaveTemplateInput };
    response: { template: PromptTemplate };
  };
  'prompts/delete': {
    request: { id: string };
    response: { deleted: true };
  };
  'batch/submit': {
    request: { input: BatchInput };
    response: BatchResult;
  };
  'downloads/list': {
    request: Record<string, never>;
    response: { tasks: DownloadTask[] };
  };
  'downloads/start': {
    request: { jobId: string };
    response: { tasks: DownloadTask[] };
  };
  'downloads/retry': {
    request: { taskId: string };
    response: { task: DownloadTask | undefined };
  };
  'history/list': {
    request: { query?: HistoryQuery };
    response: { records: HistoryRecord[] };
  };
  'analytics/snapshot': {
    request: Record<string, never>;
    response: { snapshot: AnalyticsSnapshot };
  };
  'settings/get': {
    request: Record<string, never>;
    response: { settings: UserSettings };
  };
  'settings/update': {
    request: { patch: Partial<UserSettings> };
    response: { settings: UserSettings };
  };
  'scheduler/list': {
    request: Record<string, never>;
    response: { jobs: ScheduledJob[] };
  };
  'scheduler/create': {
    request: { request: JobRequest; runAt: number };
    response: { job: ScheduledJob };
  };
  'scheduler/cancel': {
    request: { id: string };
    response: { cancelled: boolean };
  };
  'io/export': {
    request: Record<string, never>;
    response: { bundle: ExportBundle };
  };
  'io/import': {
    request: { bundle: unknown };
    response: { summary: ImportSummary };
  };
  'logs/recent': {
    request: { limit?: number };
    response: { entries: LogEntry[] };
  };
}

export type MessageType = keyof MessageMap;

/** Wire envelope so unrelated extension messages are ignored. */
export interface Envelope<K extends MessageType = MessageType> {
  channel: 'aiwf';
  type: K;
  payload: MessageMap[K]['request'];
}

export type WireResponse<K extends MessageType> =
  | { ok: true; data: MessageMap[K]['response'] }
  | { ok: false; error: string };

export function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { channel?: unknown }).channel === 'aiwf' &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}
