/**
 * Typed message contract between extension contexts (side panel, content
 * scripts) and the background service worker. Adding a message means adding
 * an entry here; both ends get compile-time checking from the same map.
 */

import type { Job, JobRequest, QueueItem } from '@/types/models';
import type { ProviderDescriptor } from '@/providers/types';
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
