/**
 * History service: archives every job that reaches a terminal state
 * (completed/failed/downloaded) into a searchable, persisted record.
 *
 * Depends on the queue only through a minimal event-source interface (not
 * the concrete QueueEngine), matching the pattern established in
 * src/downloads/manager.ts.
 */

import type { HistoryRecord, Job } from '@/types/models';
import type { QueueEvents } from '@/queue/engine';
import type { HistoryStore } from '@/services/storage/historyStore';
import type { Emitter } from '@/utils/emitter';
import { createId } from '@/utils/id';
import { createLogger, type Logger } from '@/utils/logger';

export interface JobEventSource {
  readonly events: Emitter<QueueEvents>;
}

export interface HistoryQuery {
  /** Case-insensitive substring match against the job's prompt. */
  text?: string;
  providerId?: string;
  finalState?: HistoryRecord['finalState'];
}

const TERMINAL_STATES = new Set<Job['state']>(['completed', 'failed', 'downloaded']);

export class HistoryService {
  #store: HistoryStore;
  #log: Logger;
  #records = new Map<string, HistoryRecord>();
  #unsubscribe: () => void;

  constructor(queue: JobEventSource, store: HistoryStore, logger?: Logger) {
    this.#store = store;
    this.#log = logger ?? createLogger('history');
    this.#unsubscribe = queue.events.on('job-updated', (job) => this.#onJobUpdated(job));
  }

  async restore(): Promise<void> {
    const persisted = await this.#store.getAll();
    for (const record of persisted) {
      this.#records.set(record.jobId, record);
    }
    this.#log.info(`Restored ${persisted.length} history record(s) from storage`);
  }

  list(query: HistoryQuery = {}): HistoryRecord[] {
    const text = query.text?.trim().toLowerCase();
    return [...this.#records.values()]
      .filter((record) => {
        if (text && !record.request.prompt.toLowerCase().includes(text)) return false;
        if (query.providerId && record.request.providerId !== query.providerId) return false;
        if (query.finalState && record.finalState !== query.finalState) return false;
        return true;
      })
      .sort((a, b) => b.finishedAt - a.finishedAt)
      .map((record) => structuredClone(record));
  }

  /** Merges externally-sourced records (import/export) by jobId — re-importing the same bundle is idempotent. */
  async importRecords(records: HistoryRecord[]): Promise<void> {
    for (const record of records) {
      this.#records.set(record.jobId, record);
      await this.#store.save(record);
    }
  }

  dispose(): void {
    this.#unsubscribe();
  }

  #onJobUpdated(job: Job): void {
    if (!TERMINAL_STATES.has(job.state)) return;
    const finalState = job.state as HistoryRecord['finalState'];
    const existing = this.#records.get(job.id);
    if (existing?.finalState === finalState) return;

    const finishedAt = job.completedAt ?? Date.now();
    const record: HistoryRecord = {
      id: existing?.id ?? createId('hist'),
      jobId: job.id,
      request: job.request,
      finalState,
      outputs: job.outputs ?? [],
      durationMs: finishedAt - (job.startedAt ?? job.createdAt),
      finishedAt,
    };
    if (job.error) record.error = job.error;

    this.#records.set(job.id, record);
    void this.#store.save(record).catch((error) => {
      this.#log.error(`Failed to persist history record for job ${job.id}`, error);
    });
  }
}
