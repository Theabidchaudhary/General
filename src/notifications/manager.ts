/**
 * Notification manager: fires a browser notification when a job finishes
 * (completed or failed), gated by Settings.notificationsEnabled.
 *
 * Deliberately does NOT notify again when a completed job later becomes
 * 'downloaded' — that's a follow-up action on a job the user was already
 * told about, not a new event worth interrupting them for.
 */

import type { Job } from '@/types/models';
import type { QueueEvents } from '@/queue/engine';
import type { Emitter } from '@/utils/emitter';
import type { NotificationDriver } from './driver';

export interface JobEventSource {
  readonly events: Emitter<QueueEvents>;
}

const NOTIFY_STATES = new Set<Job['state']>(['completed', 'failed']);
const MAX_MESSAGE_LENGTH = 80;

export class NotificationManager {
  #queue: JobEventSource;
  #driver: NotificationDriver;
  #enabled = false;
  #unsubscribe: (() => void) | undefined;
  #notified = new Set<string>();

  constructor(queue: JobEventSource, driver: NotificationDriver, enabled = false) {
    this.#queue = queue;
    this.#driver = driver;
    this.setEnabled(enabled);
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    if (enabled) {
      this.#unsubscribe = this.#queue.events.on('job-updated', (job) => this.#onJobUpdated(job));
    }
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  dispose(): void {
    this.#unsubscribe?.();
  }

  #onJobUpdated(job: Job): void {
    if (!NOTIFY_STATES.has(job.state) || this.#notified.has(job.id)) return;
    this.#notified.add(job.id);

    const prompt =
      job.request.prompt.length > MAX_MESSAGE_LENGTH
        ? `${job.request.prompt.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
        : job.request.prompt;

    void this.#driver.notify({
      title: job.state === 'completed' ? 'Job completed' : 'Job failed',
      message: prompt,
    });
  }
}
