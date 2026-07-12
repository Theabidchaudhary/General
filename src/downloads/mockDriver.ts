/**
 * Scriptable DownloadDriver for development and tests. Behavior is driven
 * by fields on the DownloadTarget so tests can exercise progress, failure,
 * and retry without any real filesystem or network access.
 *
 * Recognized DownloadTarget.filename prefixes (checked in order):
 *   "fail-once:"  — first start() for this url fails; a second start() (retry) succeeds.
 *   "fail-always:" — every start() for this url fails.
 * Any other filename completes successfully after emitting one progress event.
 */

import type { DownloadTarget } from '@/types/models';
import { Emitter } from '@/utils/emitter';
import { createId } from '@/utils/id';
import type { DownloadDriver, DownloadDriverEvent } from './driver';

interface DriverEvents extends Record<string, unknown> {
  event: DownloadDriverEvent;
}

export class MockDownloadDriver implements DownloadDriver {
  #emitter = new Emitter<DriverEvents>();
  #attemptsByUrl = new Map<string, number>();
  #cancelled = new Set<string>();

  async start(target: DownloadTarget, _destinationPath: string): Promise<string> {
    const handle = createId('dl');
    const attempt = (this.#attemptsByUrl.get(target.url) ?? 0) + 1;
    this.#attemptsByUrl.set(target.url, attempt);

    // Use macrotasks (not queueMicrotask) so events never fire before the
    // caller's `await start(...)` continuation runs — a caller that records
    // the handle only after start() resolves (as DownloadManager does) would
    // otherwise race an event delivered while the handle is still unknown.
    setTimeout(() => {
      if (this.#cancelled.has(handle)) return;
      this.#emitter.emit('event', { handle, type: 'progress', bytesReceived: 512, totalBytes: 1024 });

      setTimeout(() => {
        if (this.#cancelled.has(handle)) return;
        const shouldFail =
          target.filename.startsWith('fail-always:') ||
          (target.filename.startsWith('fail-once:') && attempt === 1);
        if (shouldFail) {
          this.#emitter.emit('event', {
            handle,
            type: 'failed',
            error: { code: 'NETWORK', message: 'Simulated download failure', retryable: true },
          });
        } else {
          this.#emitter.emit('event', { handle, type: 'completed' });
        }
      }, 0);
    }, 0);

    return handle;
  }

  onEvent(listener: (event: DownloadDriverEvent) => void): () => void {
    return this.#emitter.on('event', listener);
  }

  async cancel(handle: string): Promise<void> {
    this.#cancelled.add(handle);
  }
}
