/**
 * Download driver abstraction.
 *
 * Mirrors the provider adapter pattern: the download manager depends only on
 * this interface, never on chrome.downloads directly, so it can be tested
 * with a scriptable mock and swapped for a different backend later.
 */

import type { DownloadTarget, NormalizedError } from '@/types/models';

export type DownloadDriverEvent =
  | { handle: string; type: 'progress'; bytesReceived: number; totalBytes?: number }
  | { handle: string; type: 'completed' }
  | { handle: string; type: 'failed'; error: NormalizedError };

export interface DownloadDriver {
  /** Starts a download and returns a driver-specific handle used to correlate future events. */
  start(target: DownloadTarget, destinationPath: string): Promise<string>;
  /** Subscribes to progress/completion events for all downloads. Returns an unsubscribe function. */
  onEvent(listener: (event: DownloadDriverEvent) => void): () => void;
  /** Best-effort cancellation of an in-progress download. */
  cancel(handle: string): Promise<void>;
}
