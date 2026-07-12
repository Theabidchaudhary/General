/**
 * Analytics: computes a point-in-time snapshot from history records. Purely
 * derived, local-only data — nothing here is persisted or sent anywhere;
 * DEFAULT_SETTINGS.telemetryEnabled gates any future remote reporting, not
 * this in-panel computation.
 */

import type { AnalyticsSnapshot, HistoryRecord, MediaKind } from '@/types/models';
import type { HistoryQuery } from '@/history/service';

export interface HistorySource {
  list(query?: HistoryQuery): HistoryRecord[];
}

export class AnalyticsService {
  #history: HistorySource;

  constructor(history: HistorySource) {
    this.#history = history;
  }

  computeSnapshot(): AnalyticsSnapshot {
    const records = this.#history.list();
    const totalJobs = records.length;

    let completedJobs = 0;
    let failedJobs = 0;
    let downloadedJobs = 0;
    let totalDurationMs = 0;
    const jobsByProvider: Record<string, number> = {};
    const jobsByKind: Record<MediaKind, number> = { image: 0, video: 0 };

    for (const record of records) {
      if (record.finalState === 'completed') completedJobs += 1;
      else if (record.finalState === 'failed') failedJobs += 1;
      else if (record.finalState === 'downloaded') downloadedJobs += 1;

      totalDurationMs += record.durationMs;
      jobsByProvider[record.request.providerId] = (jobsByProvider[record.request.providerId] ?? 0) + 1;
      jobsByKind[record.request.kind] += 1;
    }

    return {
      capturedAt: Date.now(),
      totalJobs,
      completedJobs,
      failedJobs,
      downloadedJobs,
      averageDurationMs: totalJobs === 0 ? 0 : Math.round(totalDurationMs / totalJobs),
      jobsByProvider,
      jobsByKind,
    };
  }
}
