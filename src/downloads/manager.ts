/**
 * Download manager: turns completed job outputs into tracked downloads.
 *
 * Talks to the outside world only through a DownloadDriver (chrome.downloads
 * in production, a scriptable mock in tests) and a DownloadStore for
 * persistence, and reads job outputs from QueueEngine. On successful
 * completion of every output for a job, the job is transitioned to
 * 'downloaded' via QueueEngine.markDownloaded().
 */

import type { DownloadTarget, DownloadTask, Job } from '@/types/models';
import type { QueueEvents } from '@/queue/engine';
import type { DownloadStore } from '@/services/storage/downloadStore';
import { Emitter } from '@/utils/emitter';
import { createId } from '@/utils/id';
import { createLogger, type Logger } from '@/utils/logger';
import type { DownloadDriver, DownloadDriverEvent } from './driver';

/** The slice of QueueEngine's API the download manager needs — keeps this module decoupled from queue internals and lets tests use a lightweight double. */
export interface JobSource {
  readonly events: Emitter<QueueEvents>;
  getJob(jobId: string): Job | undefined;
  markDownloaded(jobId: string): Promise<boolean>;
}

export interface DownloadManagerOptions {
  queue: JobSource;
  driver: DownloadDriver;
  store: DownloadStore;
  logger?: Logger;
  /** Subfolder (relative to the browser's downloads directory) outputs are saved under. */
  subfolder?: string;
  /** If true, every job that completes is downloaded automatically. */
  autoDownload?: boolean;
}

export interface DownloadEvents extends Record<string, unknown> {
  'task-updated': DownloadTask;
}

export class DownloadManager {
  readonly events = new Emitter<DownloadEvents>();

  #queue: JobSource;
  #driver: DownloadDriver;
  #store: DownloadStore;
  #log: Logger;
  #subfolder: string | undefined;

  #tasks = new Map<string, DownloadTask>();
  #handleToTaskId = new Map<string, string>();
  #driverUnsubscribe: () => void;
  #queueUnsubscribe: (() => void) | undefined;
  #autoDownload: boolean;

  constructor(options: DownloadManagerOptions) {
    this.#queue = options.queue;
    this.#driver = options.driver;
    this.#store = options.store;
    this.#log = options.logger ?? createLogger('downloads');
    this.#subfolder = options.subfolder;
    this.#autoDownload = options.autoDownload ?? false;

    this.#driverUnsubscribe = this.#driver.onEvent((event) => this.#handleDriverEvent(event));
    this.setAutoDownload(this.#autoDownload);
  }

  setAutoDownload(enabled: boolean): void {
    this.#autoDownload = enabled;
    this.#queueUnsubscribe?.();
    this.#queueUnsubscribe = undefined;
    if (enabled) {
      this.#queueUnsubscribe = this.#queue.events.on('job-updated', (job) => {
        if (job.state === 'completed') void this.downloadJob(job.id);
      });
    }
  }

  get autoDownload(): boolean {
    return this.#autoDownload;
  }

  setSubfolder(subfolder: string | undefined): void {
    this.#subfolder = subfolder;
  }

  async restore(): Promise<void> {
    const persisted = await this.#store.getAll();
    for (const task of persisted) {
      // Handles from a prior worker lifetime are gone; strand-proof by
      // marking interrupted transfers as retryable failures.
      if (task.state === 'queued' || task.state === 'in_progress') {
        task.state = 'failed';
        task.error = { code: 'UNKNOWN', message: 'Interrupted by restart', retryable: true };
        await this.#store.save(task);
      }
      this.#tasks.set(task.id, task);
    }
    this.#log.info(`Restored ${persisted.length} download task(s) from storage`);
  }

  listTasks(): DownloadTask[] {
    return [...this.#tasks.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((task) => structuredClone(task));
  }

  getTasksForJob(jobId: string): DownloadTask[] {
    return this.listTasks().filter((task) => task.jobId === jobId);
  }

  /** Starts downloading every output of a completed job that isn't already downloading/downloaded. */
  async downloadJob(jobId: string): Promise<DownloadTask[]> {
    const job = this.#queue.getJob(jobId);
    if (!job || job.state !== 'completed' || !job.outputs?.length) return [];

    const existing = this.getTasksForJob(jobId);
    const created: DownloadTask[] = [];
    for (const target of job.outputs) {
      const alreadyHandled = existing.some(
        (task) => task.target.url === target.url && task.state !== 'failed',
      );
      if (alreadyHandled) continue;
      created.push(await this.#startDownload(jobId, target));
    }
    return created;
  }

  /** Retries a failed download, reusing its task id. */
  async retry(taskId: string): Promise<DownloadTask | undefined> {
    const task = this.#tasks.get(taskId);
    if (!task || task.state !== 'failed') return undefined;
    return this.#startDownload(task.jobId, task.target, taskId);
  }

  dispose(): void {
    this.#driverUnsubscribe();
    this.#queueUnsubscribe?.();
  }

  // ---------------------------------------------------------------- internals

  async #startDownload(jobId: string, target: DownloadTarget, reuseTaskId?: string): Promise<DownloadTask> {
    const now = Date.now();
    const previous = reuseTaskId ? this.#tasks.get(reuseTaskId) : undefined;
    const task: DownloadTask = {
      id: reuseTaskId ?? createId('dl'),
      jobId,
      target,
      state: 'queued',
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    await this.#persist(task);

    try {
      const destinationPath = this.#subfolder ? `${this.#subfolder}/${target.filename}` : target.filename;
      const handle = await this.#driver.start(target, destinationPath);
      this.#handleToTaskId.set(handle, task.id);
      task.state = 'in_progress';
      await this.#persist(task);
    } catch (error) {
      task.state = 'failed';
      task.error = {
        code: 'UNKNOWN',
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
      };
      await this.#persist(task);
      this.#log.warn(`Download failed to start for job ${jobId}`, error);
    }
    return structuredClone(task);
  }

  #handleDriverEvent(event: DownloadDriverEvent): void {
    const taskId = this.#handleToTaskId.get(event.handle);
    if (!taskId) return;
    const task = this.#tasks.get(taskId);
    if (!task) return;

    if (event.type === 'progress') {
      task.bytesReceived = event.bytesReceived;
      void this.#persist(task);
      return;
    }

    this.#handleToTaskId.delete(event.handle);
    if (event.type === 'completed') {
      task.state = 'completed';
      delete task.error;
      // Mark the job downloaded (if this was its last outstanding output)
      // before persisting/emitting this task's own update, so a listener
      // reacting to the 'completed' task-updated event can rely on the
      // job's 'downloaded' transition having already happened.
      void this.#maybeMarkJobDownloaded(task.jobId).then(() => this.#persist(task));
    } else {
      task.state = 'failed';
      task.error = event.error;
      void this.#persist(task);
      this.#log.warn(`Download failed for job ${task.jobId}`, event.error);
    }
  }

  async #maybeMarkJobDownloaded(jobId: string): Promise<void> {
    const job = this.#queue.getJob(jobId);
    if (!job || job.state !== 'completed' || !job.outputs?.length) return;
    const tasks = this.getTasksForJob(jobId);
    const allDownloaded = job.outputs.every((target) =>
      tasks.some((task) => task.target.url === target.url && task.state === 'completed'),
    );
    if (allDownloaded) await this.#queue.markDownloaded(jobId);
  }

  async #persist(task: DownloadTask): Promise<void> {
    task.updatedAt = Date.now();
    this.#tasks.set(task.id, task);
    await this.#store.save(task);
    this.events.emit('task-updated', structuredClone(task));
  }
}
