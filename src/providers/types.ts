/**
 * Provider abstraction layer.
 *
 * Every AI generation service is integrated through a ProviderAdapter. The
 * queue engine and UI depend exclusively on this interface — no module
 * outside src/providers may reference a concrete provider.
 */

import type {
  DownloadTarget,
  ErrorCode,
  JobRequest,
  NormalizedError,
  ProviderCapability,
  ProviderSubmission,
} from '@/types/models';

export type AuthStatus = 'authenticated' | 'unauthenticated' | 'unknown';

/** Serializable summary handed to the UI's provider selector. */
export interface ProviderDescriptor {
  id: string;
  name: string;
  authStatus: AuthStatus;
  capabilities: ProviderCapability[];
}

/** Result of one polling round-trip for an in-flight submission. */
export type PollResult =
  | { status: 'queued' | 'processing'; progress?: number }
  | { status: 'succeeded' }
  | { status: 'failed'; error: NormalizedError };

/**
 * Contract each provider integration implements. All methods must reject
 * with ProviderError (or a value convertible via normalizeError) so the
 * queue engine can make uniform retry decisions.
 */
export interface ProviderAdapter {
  readonly id: string;
  readonly name: string;

  getAuthStatus(): Promise<AuthStatus>;
  getCapabilities(): Promise<ProviderCapability[]>;

  /** Rejects with ProviderError(INVALID_REQUEST) when the request cannot be submitted. */
  validate(request: JobRequest): Promise<void>;

  /** Submits work to the provider and returns a handle for polling. */
  submit(request: JobRequest, signal: AbortSignal): Promise<ProviderSubmission>;

  /** Checks the status of an accepted submission. */
  poll(submission: ProviderSubmission, signal: AbortSignal): Promise<PollResult>;

  /** Resolves final artifact URLs for a succeeded submission. */
  resolveDownloads(submission: ProviderSubmission, signal: AbortSignal): Promise<DownloadTarget[]>;

  /** Best-effort cancellation of provider-side work. */
  cancel(submission: ProviderSubmission): Promise<void>;
}

/** Error type all provider failures are normalized into. */
export class ProviderError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { retryable?: boolean; retryAfterMs?: number },
  ) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.retryable = options?.retryable ?? DEFAULT_RETRYABLE[code];
    this.retryAfterMs = options?.retryAfterMs;
  }

  toNormalized(): NormalizedError {
    const normalized: NormalizedError = {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
    if (this.retryAfterMs !== undefined) normalized.retryAfterMs = this.retryAfterMs;
    return normalized;
  }
}

const DEFAULT_RETRYABLE: Record<ErrorCode, boolean> = {
  AUTH_REQUIRED: false,
  RATE_LIMITED: true,
  INVALID_REQUEST: false,
  CONTENT_REJECTED: false,
  PROVIDER_UNAVAILABLE: true,
  TIMEOUT: true,
  NETWORK: true,
  CANCELLED: false,
  UNKNOWN: false,
};

/** Converts any thrown value into a NormalizedError for persistence. */
export function normalizeError(value: unknown): NormalizedError {
  if (value instanceof ProviderError) return value.toNormalized();
  if (value instanceof Error) {
    return { code: 'UNKNOWN', message: value.message, retryable: false };
  }
  return { code: 'UNKNOWN', message: String(value), retryable: false };
}
