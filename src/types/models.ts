/**
 * Core data models shared across all feature modules.
 *
 * These types are the contract between the background service worker, the
 * side panel UI, and persistence. Feature modules must consume these types
 * rather than defining parallel shapes.
 */

/** Lifecycle of a queued generation job. */
export type JobState =
  | 'pending'
  | 'validating'
  | 'running'
  | 'waiting'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'downloaded';

/** Media kinds the workflow engine can produce. */
export type MediaKind = 'image' | 'video';

/** Normalized provider error codes. UI logic must switch on these, never on provider-specific messages. */
export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'RATE_LIMITED'
  | 'INVALID_REQUEST'
  | 'CONTENT_REJECTED'
  | 'PROVIDER_UNAVAILABLE'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'CANCELLED'
  | 'UNKNOWN';

/** A provider-agnostic description of what to generate. */
export interface JobRequest {
  providerId: string;
  kind: MediaKind;
  prompt: string;
  negativePrompt?: string;
  /** Provider-specific tuning knobs (validated by the provider adapter). */
  params: Record<string, string | number | boolean>;
  /** Prompt template this request was expanded from, if any. */
  templateId?: string;
}

/** Normalized, serializable error attached to jobs and history records. */
export interface NormalizedError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  /** Provider-suggested delay before the next attempt, when known. */
  retryAfterMs?: number;
}

/** Handle returned by a provider once a request has been accepted. */
export interface ProviderSubmission {
  providerId: string;
  /** Provider-side identifier used for polling and cancellation. */
  remoteId: string;
  submittedAt: number;
}

/** A downloadable output resolved from a completed submission. */
export interface DownloadTarget {
  url: string;
  filename: string;
  kind: MediaKind;
  mimeType?: string;
  sizeBytes?: number;
}

/** A unit of work tracked by the queue engine. */
export interface Job {
  id: string;
  request: JobRequest;
  state: JobState;
  /** Higher runs earlier. Ties break on createdAt (FIFO). */
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  /** For 'retrying'/'waiting': earliest timestamp the next attempt may start. */
  nextAttemptAt?: number;
  submission?: ProviderSubmission;
  outputs?: DownloadTarget[];
  error?: NormalizedError;
}

/** Queue-facing view of a job used by list UIs. */
export interface QueueItem {
  jobId: string;
  state: JobState;
  priority: number;
  position: number;
}

/** A reusable prompt with declared variables. */
export interface PromptTemplate {
  id: string;
  name: string;
  body: string;
  /** Variable names referenced as {{name}} inside body. */
  variables: string[];
  kind: MediaKind;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

/** A single capability a provider advertises (e.g. image generation at a size). */
export interface ProviderCapability {
  kind: MediaKind;
  /** Machine-readable capability key, e.g. 'image.txt2img'. */
  key: string;
  label: string;
  /** Declared limits such as max prompt length or resolution options. */
  limits?: Record<string, string | number>;
}

/** State of one file being downloaded by the download manager. */
export interface DownloadTask {
  id: string;
  jobId: string;
  target: DownloadTarget;
  state: 'queued' | 'in_progress' | 'completed' | 'failed';
  bytesReceived?: number;
  error?: NormalizedError;
  createdAt: number;
  updatedAt: number;
}

/** Immutable record of a finished job kept for the history view. */
export interface HistoryRecord {
  id: string;
  jobId: string;
  request: JobRequest;
  finalState: Extract<JobState, 'completed' | 'failed' | 'downloaded'>;
  outputs: DownloadTarget[];
  error?: NormalizedError;
  durationMs: number;
  finishedAt: number;
}

/** User-configurable settings synced via chrome.storage. */
export interface UserSettings {
  theme: 'system' | 'light' | 'dark';
  maxConcurrentJobs: number;
  maxAttempts: number;
  autoDownload: boolean;
  downloadSubfolder: string;
  notificationsEnabled: boolean;
  /** Local-only analytics collection; nothing leaves the browser. */
  telemetryEnabled: boolean;
  defaultProviderId?: string;
}

/** Point-in-time aggregate used by the analytics dashboard. */
export interface AnalyticsSnapshot {
  capturedAt: number;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  downloadedJobs: number;
  averageDurationMs: number;
  jobsByProvider: Record<string, number>;
  jobsByKind: Record<MediaKind, number>;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  maxConcurrentJobs: 2,
  maxAttempts: 3,
  autoDownload: false,
  downloadSubfolder: 'ai-workflow-studio',
  notificationsEnabled: true,
  telemetryEnabled: false,
};
