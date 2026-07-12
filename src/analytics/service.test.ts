import { describe, expect, it } from 'vitest';
import type { HistoryRecord } from '@/types/models';
import { AnalyticsService, type HistorySource } from './service';

class FakeHistory implements HistorySource {
  #records: HistoryRecord[];
  constructor(records: HistoryRecord[]) {
    this.#records = records;
  }
  list(): HistoryRecord[] {
    return this.#records;
  }
}

function record(overrides: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    id: 'hist_1',
    jobId: 'job_1',
    request: { providerId: 'mock', kind: 'image', prompt: 'x', params: {} },
    finalState: 'completed',
    outputs: [],
    durationMs: 100,
    finishedAt: Date.now(),
    ...overrides,
  };
}

describe('AnalyticsService', () => {
  it('returns a zeroed snapshot when there is no history', () => {
    const service = new AnalyticsService(new FakeHistory([]));
    const snapshot = service.computeSnapshot();
    expect(snapshot.totalJobs).toBe(0);
    expect(snapshot.averageDurationMs).toBe(0);
    expect(snapshot.jobsByKind).toEqual({ image: 0, video: 0 });
    expect(snapshot.jobsByProvider).toEqual({});
  });

  it('counts jobs by final state', () => {
    const service = new AnalyticsService(
      new FakeHistory([
        record({ finalState: 'completed' }),
        record({ finalState: 'failed' }),
        record({ finalState: 'downloaded' }),
        record({ finalState: 'downloaded' }),
      ]),
    );
    const snapshot = service.computeSnapshot();
    expect(snapshot.totalJobs).toBe(4);
    expect(snapshot.completedJobs).toBe(1);
    expect(snapshot.failedJobs).toBe(1);
    expect(snapshot.downloadedJobs).toBe(2);
  });

  it('computes the average duration across all records', () => {
    const service = new AnalyticsService(
      new FakeHistory([record({ durationMs: 100 }), record({ durationMs: 300 })]),
    );
    expect(service.computeSnapshot().averageDurationMs).toBe(200);
  });

  it('breaks down jobs by provider and kind', () => {
    const service = new AnalyticsService(
      new FakeHistory([
        record({ request: { providerId: 'mock', kind: 'image', prompt: 'a', params: {} } }),
        record({ request: { providerId: 'mock', kind: 'video', prompt: 'b', params: {} } }),
        record({ request: { providerId: 'other', kind: 'image', prompt: 'c', params: {} } }),
      ]),
    );
    const snapshot = service.computeSnapshot();
    expect(snapshot.jobsByProvider).toEqual({ mock: 2, other: 1 });
    expect(snapshot.jobsByKind).toEqual({ image: 2, video: 1 });
  });

  it('stamps capturedAt with the current time', () => {
    const before = Date.now();
    const snapshot = new AnalyticsService(new FakeHistory([])).computeSnapshot();
    expect(snapshot.capturedAt).toBeGreaterThanOrEqual(before);
  });
});
