import { describe, expect, it } from 'vitest';
import type { DownloadTarget, Job } from '@/types/models';
import type { QueueEvents } from '@/queue/engine';
import { MemoryDownloadStore } from '@/services/storage/downloadStore';
import { Emitter } from '@/utils/emitter';
import { createId } from '@/utils/id';
import { DownloadManager, type JobSource } from './manager';
import { MockDownloadDriver } from './mockDriver';

/** Minimal JobSource double: an in-memory job map plus the same event shape QueueEngine emits. */
class FakeQueue implements JobSource {
  readonly events = new Emitter<QueueEvents>();
  #jobs = new Map<string, Job>();

  addJob(job: Job): void {
    this.#jobs.set(job.id, job);
  }

  getJob(jobId: string): Job | undefined {
    return this.#jobs.get(jobId);
  }

  async markDownloaded(jobId: string): Promise<boolean> {
    const job = this.#jobs.get(jobId);
    if (!job || job.state !== 'completed') return false;
    job.state = 'downloaded';
    this.events.emit('job-updated', job);
    return true;
  }

  /** Emits a job-updated event without changing markDownloaded semantics, for autoDownload tests. */
  emitUpdate(job: Job): void {
    this.events.emit('job-updated', job);
  }
}

function makeTarget(overrides: Partial<DownloadTarget> = {}): DownloadTarget {
  return { url: `https://mock.invalid/${createId()}`, filename: `${createId()}.png`, kind: 'image', ...overrides };
}

function makeCompletedJob(outputs: DownloadTarget[]): Job {
  const now = Date.now();
  return {
    id: createId('job'),
    request: { providerId: 'mock', kind: 'image', prompt: 'x', params: {} },
    state: 'completed',
    priority: 0,
    attempts: 1,
    maxAttempts: 3,
    createdAt: now,
    updatedAt: now,
    outputs,
  };
}

function waitForTaskState(
  manager: DownloadManager,
  taskId: string,
  states: Array<'queued' | 'in_progress' | 'completed' | 'failed'>,
): Promise<void> {
  return new Promise((resolve) => {
    const off = manager.events.on('task-updated', (task) => {
      if (task.id === taskId && states.includes(task.state)) {
        off();
        resolve();
      }
    });
  });
}

describe('DownloadManager', () => {
  it('downloads every output of a completed job and marks it downloaded', async () => {
    const queue = new FakeQueue();
    const manager = new DownloadManager({ queue, driver: new MockDownloadDriver(), store: new MemoryDownloadStore() });
    const job = makeCompletedJob([makeTarget(), makeTarget()]);
    queue.addJob(job);

    const tasks = await manager.downloadJob(job.id);
    expect(tasks).toHaveLength(2);

    await Promise.all(tasks.map((t) => waitForTaskState(manager, t.id, ['completed'])));

    expect(manager.listTasks().every((t) => t.state === 'completed')).toBe(true);
    expect(queue.getJob(job.id)?.state).toBe('downloaded');
  });

  it('does not create duplicate tasks for outputs already handled', async () => {
    const queue = new FakeQueue();
    const manager = new DownloadManager({ queue, driver: new MockDownloadDriver(), store: new MemoryDownloadStore() });
    const job = makeCompletedJob([makeTarget()]);
    queue.addJob(job);

    const first = await manager.downloadJob(job.id);
    const second = await manager.downloadJob(job.id);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(manager.getTasksForJob(job.id)).toHaveLength(1);
  });

  it('returns no tasks for jobs that are not completed or have no outputs', async () => {
    const queue = new FakeQueue();
    const manager = new DownloadManager({ queue, driver: new MockDownloadDriver(), store: new MemoryDownloadStore() });
    const pending = makeCompletedJob([]);
    pending.state = 'pending';
    queue.addJob(pending);
    expect(await manager.downloadJob(pending.id)).toHaveLength(0);

    const noOutputs = makeCompletedJob([]);
    queue.addJob(noOutputs);
    expect(await manager.downloadJob(noOutputs.id)).toHaveLength(0);
  });

  it('marks a failed download and lets it be retried to success', async () => {
    const queue = new FakeQueue();
    const manager = new DownloadManager({ queue, driver: new MockDownloadDriver(), store: new MemoryDownloadStore() });
    const job = makeCompletedJob([makeTarget({ filename: 'fail-once:art.png' })]);
    queue.addJob(job);

    const [task] = await manager.downloadJob(job.id);
    expect(task).toBeDefined();
    await waitForTaskState(manager, task!.id, ['failed']);
    expect(manager.listTasks()[0]?.state).toBe('failed');
    expect(manager.listTasks()[0]?.error?.code).toBe('NETWORK');
    expect(queue.getJob(job.id)?.state).toBe('completed');

    const retried = await manager.retry(task!.id);
    expect(retried?.id).toBe(task!.id);
    await waitForTaskState(manager, task!.id, ['completed']);
    expect(manager.listTasks()).toHaveLength(1);
    expect(manager.listTasks()[0]?.state).toBe('completed');
    expect(queue.getJob(job.id)?.state).toBe('downloaded');
  });

  it('rejects retrying a task that does not exist or is not failed', async () => {
    const queue = new FakeQueue();
    const manager = new DownloadManager({ queue, driver: new MockDownloadDriver(), store: new MemoryDownloadStore() });
    expect(await manager.retry('nope')).toBeUndefined();

    const job = makeCompletedJob([makeTarget()]);
    queue.addJob(job);
    const [task] = await manager.downloadJob(job.id);
    await waitForTaskState(manager, task!.id, ['completed']);
    expect(await manager.retry(task!.id)).toBeUndefined();
  });

  it('records progress bytes before completion', async () => {
    const queue = new FakeQueue();
    const manager = new DownloadManager({ queue, driver: new MockDownloadDriver(), store: new MemoryDownloadStore() });
    const job = makeCompletedJob([makeTarget()]);
    queue.addJob(job);
    const [task] = await manager.downloadJob(job.id);
    await waitForTaskState(manager, task!.id, ['completed']);
    expect(manager.listTasks()[0]?.bytesReceived).toBe(512);
  });

  it('auto-downloads when enabled and leaves manual control off by default', async () => {
    const queueA = new FakeQueue();
    const manualManager = new DownloadManager({ queue: queueA, driver: new MockDownloadDriver(), store: new MemoryDownloadStore() });
    expect(manualManager.autoDownload).toBe(false);
    const jobA = makeCompletedJob([makeTarget()]);
    queueA.addJob(jobA);
    queueA.emitUpdate(jobA);
    await new Promise((r) => setTimeout(r, 20));
    expect(manualManager.listTasks()).toHaveLength(0);

    const queueB = new FakeQueue();
    const autoManager = new DownloadManager({
      queue: queueB,
      driver: new MockDownloadDriver(),
      store: new MemoryDownloadStore(),
      autoDownload: true,
    });
    const jobB = makeCompletedJob([makeTarget()]);
    queueB.addJob(jobB);
    queueB.emitUpdate(jobB);
    await new Promise((resolve) => {
      const off = autoManager.events.on('task-updated', (task) => {
        if (task.state === 'completed') {
          off();
          resolve(undefined);
        }
      });
    });
    expect(autoManager.listTasks()).toHaveLength(1);
  });

  it('marks interrupted queued/in_progress tasks as failed on restore', async () => {
    const store = new MemoryDownloadStore();
    const now = Date.now();
    await store.save({
      id: 'dl_stuck',
      jobId: 'job_x',
      target: makeTarget(),
      state: 'in_progress',
      createdAt: now,
      updatedAt: now,
    });

    const queue = new FakeQueue();
    const manager = new DownloadManager({ queue, driver: new MockDownloadDriver(), store });
    await manager.restore();

    const task = manager.listTasks()[0];
    expect(task?.state).toBe('failed');
    expect(task?.error?.retryable).toBe(true);
  });

  it('subfolder is applied to the destination path passed to the driver', async () => {
    const queue = new FakeQueue();
    const seenPaths: string[] = [];
    const driver = new MockDownloadDriver();
    const originalStart = driver.start.bind(driver);
    driver.start = async (target, destinationPath) => {
      seenPaths.push(destinationPath);
      return originalStart(target, destinationPath);
    };
    const manager = new DownloadManager({ queue, driver, store: new MemoryDownloadStore(), subfolder: 'ai-workflow-studio' });
    const job = makeCompletedJob([makeTarget({ filename: 'art.png' })]);
    queue.addJob(job);
    await manager.downloadJob(job.id);
    expect(seenPaths).toEqual(['ai-workflow-studio/art.png']);
  });
});
