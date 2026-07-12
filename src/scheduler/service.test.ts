import { describe, expect, it, vi } from 'vitest';
import type { JobRequest } from '@/types/models';
import { MemoryScheduledJobStore } from '@/services/storage/scheduledJobStore';
import { Scheduler, ScheduleValidationError, type JobSink } from './service';

class FakeQueue implements JobSink {
  enqueued: JobRequest[] = [];
  async enqueue(request: JobRequest): Promise<unknown> {
    this.enqueued.push(request);
    return { id: 'job_x' };
  }
}

function request(): JobRequest {
  return { providerId: 'mock', kind: 'image', prompt: 'a fox', params: {} };
}

describe('Scheduler', () => {
  it('rejects scheduling in the past or present', async () => {
    const scheduler = new Scheduler(new FakeQueue(), new MemoryScheduledJobStore());
    await expect(scheduler.schedule(request(), Date.now() - 1000)).rejects.toBeInstanceOf(
      ScheduleValidationError,
    );
    await expect(scheduler.schedule(request(), Date.now())).rejects.toBeInstanceOf(ScheduleValidationError);
  });

  it('schedules a future job in pending state', async () => {
    const scheduler = new Scheduler(new FakeQueue(), new MemoryScheduledJobStore());
    const runAt = Date.now() + 60_000;
    const job = await scheduler.schedule(request(), runAt);
    expect(job.state).toBe('pending');
    expect(job.runAt).toBe(runAt);
    expect(scheduler.list()).toHaveLength(1);
  });

  it('does not fire jobs before their time', async () => {
    const queue = new FakeQueue();
    const scheduler = new Scheduler(queue, new MemoryScheduledJobStore());
    await scheduler.schedule(request(), Date.now() + 60_000);
    const fired = await scheduler.tick(Date.now());
    expect(fired).toHaveLength(0);
    expect(queue.enqueued).toHaveLength(0);
  });

  it('fires due jobs and marks them fired', async () => {
    const queue = new FakeQueue();
    const scheduler = new Scheduler(queue, new MemoryScheduledJobStore());
    const runAt = Date.now() + 1000;
    const job = await scheduler.schedule(request(), runAt);

    const fired = await scheduler.tick(runAt + 1);
    expect(fired).toHaveLength(1);
    expect(fired[0]?.id).toBe(job.id);
    expect(queue.enqueued).toHaveLength(1);
    expect(scheduler.list()[0]?.state).toBe('fired');
  });

  it('never fires a job twice across repeated ticks', async () => {
    const queue = new FakeQueue();
    const scheduler = new Scheduler(queue, new MemoryScheduledJobStore());
    const runAt = Date.now() + 1000;
    await scheduler.schedule(request(), runAt);

    await scheduler.tick(runAt + 1);
    await scheduler.tick(runAt + 5000);
    expect(queue.enqueued).toHaveLength(1);
  });

  it('cancels a pending job so it never fires', async () => {
    const queue = new FakeQueue();
    const scheduler = new Scheduler(queue, new MemoryScheduledJobStore());
    const runAt = Date.now() + 1000;
    const job = await scheduler.schedule(request(), runAt);

    expect(await scheduler.cancel(job.id)).toBe(true);
    expect(scheduler.list()[0]?.state).toBe('cancelled');

    const fired = await scheduler.tick(runAt + 1);
    expect(fired).toHaveLength(0);
    expect(queue.enqueued).toHaveLength(0);
  });

  it('cancel returns false for unknown or non-pending jobs', async () => {
    const queue = new FakeQueue();
    const scheduler = new Scheduler(queue, new MemoryScheduledJobStore());
    expect(await scheduler.cancel('nope')).toBe(false);

    const runAt = Date.now() + 1000;
    const job = await scheduler.schedule(request(), runAt);
    await scheduler.tick(runAt + 1);
    expect(await scheduler.cancel(job.id)).toBe(false);
  });

  it('lists jobs sorted by runAt ascending', async () => {
    const scheduler = new Scheduler(new FakeQueue(), new MemoryScheduledJobStore());
    const later = await scheduler.schedule(request(), Date.now() + 120_000);
    const sooner = await scheduler.schedule(request(), Date.now() + 60_000);
    expect(scheduler.list().map((j) => j.id)).toEqual([sooner.id, later.id]);
  });

  it('continues ticking past a job whose enqueue fails', async () => {
    const queue: JobSink = { enqueue: vi.fn().mockRejectedValue(new Error('boom')) };
    const scheduler = new Scheduler(queue, new MemoryScheduledJobStore());
    const runAt = Date.now() + 1000;
    await scheduler.schedule(request(), runAt);
    const fired = await scheduler.tick(runAt + 1);
    expect(fired).toHaveLength(0);
    // Stays pending so a later tick can retry it.
    expect(scheduler.list()[0]?.state).toBe('pending');
  });

  it('restores persisted jobs from storage', async () => {
    const store = new MemoryScheduledJobStore();
    await store.save({
      id: 'sched_1',
      request: request(),
      runAt: Date.now() + 60_000,
      state: 'pending',
      createdAt: Date.now(),
    });
    const scheduler = new Scheduler(new FakeQueue(), store);
    await scheduler.restore();
    expect(scheduler.list()).toHaveLength(1);
  });
});
