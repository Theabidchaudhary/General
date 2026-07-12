/**
 * chrome.downloads-backed DownloadDriver used by the background service
 * worker. Handles are chrome's numeric download ids, stringified so the
 * driver interface stays transport-agnostic.
 */

import type { DownloadTarget } from '@/types/models';
import { Emitter } from '@/utils/emitter';
import type { DownloadDriver, DownloadDriverEvent } from './driver';

interface DriverEvents extends Record<string, unknown> {
  event: DownloadDriverEvent;
}

export class ChromeDownloadDriver implements DownloadDriver {
  #emitter = new Emitter<DriverEvents>();
  #listening = false;

  #ensureListening(): void {
    if (this.#listening) return;
    this.#listening = true;
    chrome.downloads.onChanged.addListener((delta) => {
      const handle = String(delta.id);
      if (delta.error?.current) {
        this.#emitter.emit('event', {
          handle,
          type: 'failed',
          error: { code: 'UNKNOWN', message: delta.error.current, retryable: true },
        });
        return;
      }
      if (delta.state?.current === 'complete') {
        this.#emitter.emit('event', { handle, type: 'completed' });
        return;
      }
      if (delta.state?.current === 'interrupted') {
        this.#emitter.emit('event', {
          handle,
          type: 'failed',
          error: { code: 'UNKNOWN', message: 'Download interrupted', retryable: true },
        });
      }
    });
  }

  async start(target: DownloadTarget, destinationPath: string): Promise<string> {
    this.#ensureListening();
    const downloadId = await chrome.downloads.download({
      url: target.url,
      filename: destinationPath,
      conflictAction: 'uniquify',
    });
    return String(downloadId);
  }

  onEvent(listener: (event: DownloadDriverEvent) => void): () => void {
    return this.#emitter.on('event', listener);
  }

  async cancel(handle: string): Promise<void> {
    await chrome.downloads.cancel(Number(handle));
  }
}
