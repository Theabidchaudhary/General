import { describe, expect, it } from 'vitest';
import type { QueueEvents } from '@/queue/engine';
import { MemoryHistoryStore } from '@/services/storage/historyStore';
import type { Job } from '@/types/models';
import { Emitter } from '@/utils/emitter';
import { createId } from '@/utils/id';
import { HistoryService, type JobEventSource } from './service';

class FakeQueue implements JobEventSource {
  readonly events = new Emitter<QueueEvents>();
  emit(job: Job): void {
    this.events.emit('job-updated', job);
  }
}

function makeJob(overrides: Partial<Job> = {}): Job {
  const now = Date.now();
  return {
    id: createId('job'),
    request: { providerId: 'mock', kind: 'image', prompt: 'a red fox', params: {} },
    state: 'completed',
    priority: 0,
    attempts: 1,
    maxAttempts: 3,
    createdAt: now - 100,
    updatedAt: now,
    startedAt: now - 80,
    completedAt: now,
    outputs: [{ url: 'https://mock.invalid/a.png', filename: 'a.png', kind: 'image' }],
    ...overrides,
  };
}

/** Like makeJob, but for a failed job that produced no outputs. */
function makeFailedJob(overrides: Partial<Job> = {}): Job {
  const job = makeJob({ state: 'failed', ...overrides });
  const { outputs: _outputs, ...withoutOutputs } = job;
  return withoutOutputs;
}

describe('HistoryService', () => {
  it('records a job when it first reaches a terminal state', () => {
    const queue = new FakeQueue();
    const service = new HistoryService(queue, new MemoryHistoryStore());
    const job = makeJob();
    queue.emit(job);

    const [record] = service.list();
    expect(record?.jobId).toBe(job.id);
    expect(record?.finalState).toBe('completed');
    expect(record?.outputs).toEqual(job.outputs);
    expect(record?.durationMs).toBe(80);
  });

  it('updates the same record when a job later transitions to downloaded', () => {
    const queue = new FakeQueue();
    const service = new HistoryService(queue, new MemoryHistoryStore());
    const job = makeJob();
    queue.emit(job);
    const firstId = service.list()[0]?.id;

    queue.emit({ ...job, state: 'downloaded' });
    const records = service.list();
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe(firstId);
    expect(records[0]?.finalState).toBe('downloaded');
  });

  it('records failed jobs with their error', () => {
    const queue = new FakeQueue();
    const service = new HistoryService(queue, new MemoryHistoryStore());
    const job = makeFailedJob({
      error: { code: 'INVALID_REQUEST', message: 'bad prompt', retryable: false },
    });
    queue.emit(job);

    const [record] = service.list();
    expect(record?.finalState).toBe('failed');
    expect(record?.error?.code).toBe('INVALID_REQUEST');
    expect(record?.outputs).toEqual([]);
  });

  it('ignores non-terminal state updates', () => {
    const queue = new FakeQueue();
    const service = new HistoryService(queue, new MemoryHistoryStore());
    queue.emit(makeJob({ state: 'running' }));
    expect(service.list()).toHaveLength(0);
  });

  it('does not duplicate a record for repeated identical terminal states', () => {
    const queue = new FakeQueue();
    const service = new HistoryService(queue, new MemoryHistoryStore());
    const job = makeJob();
    queue.emit(job);
    queue.emit(job);
    expect(service.list()).toHaveLength(1);
  });

  it('filters by text, providerId, and finalState', () => {
    const queue = new FakeQueue();
    const service = new HistoryService(queue, new MemoryHistoryStore());
    queue.emit(makeJob({ request: { providerId: 'mock', kind: 'image', prompt: 'a red fox', params: {} } }));
    queue.emit(
      makeFailedJob({
        request: { providerId: 'other', kind: 'video', prompt: 'a blue whale', params: {} },
        error: { code: 'UNKNOWN', message: 'x', retryable: false },
      }),
    );

    expect(service.list({ text: 'fox' })).toHaveLength(1);
    expect(service.list({ providerId: 'other' })).toHaveLength(1);
    expect(service.list({ finalState: 'failed' })).toHaveLength(1);
    expect(service.list({ text: 'nonexistent' })).toHaveLength(0);
  });

  it('sorts newest finished first', () => {
    const queue = new FakeQueue();
    const service = new HistoryService(queue, new MemoryHistoryStore());
    queue.emit(makeJob({ completedAt: 1000 }));
    queue.emit(makeJob({ completedAt: 2000 }));
    const records = service.list();
    expect(records[0]?.finishedAt).toBe(2000);
    expect(records[1]?.finishedAt).toBe(1000);
  });

  it('restores persisted records from storage', async () => {
    const store = new MemoryHistoryStore();
    await store.save({
      id: 'hist_1',
      jobId: 'job_1',
      request: { providerId: 'mock', kind: 'image', prompt: 'x', params: {} },
      finalState: 'completed',
      outputs: [],
      durationMs: 10,
      finishedAt: Date.now(),
    });
    const queue = new FakeQueue();
    const service = new HistoryService(queue, store);
    await service.restore();
    expect(service.list()).toHaveLength(1);
  });

  it('stops recording after dispose', () => {
    const queue = new FakeQueue();
    const service = new HistoryService(queue, new MemoryHistoryStore());
    service.dispose();
    queue.emit(makeJob());
    expect(service.list()).toHaveLength(0);
  });

  it('importRecords persists externally-sourced records and is idempotent by jobId', async () => {
    const store = new MemoryHistoryStore();
    const service = new HistoryService(new FakeQueue(), store);
    const record = {
      id: 'hist_imported',
      jobId: 'job_imported',
      request: { providerId: 'mock', kind: 'image' as const, prompt: 'imported', params: {} },
      finalState: 'completed' as const,
      outputs: [],
      durationMs: 5,
      finishedAt: Date.now(),
    };
    await service.importRecords([record]);
    expect(service.list()).toHaveLength(1);
    expect((await store.getAll())).toHaveLength(1);

    await service.importRecords([record]);
    expect(service.list()).toHaveLength(1);
  });
});
