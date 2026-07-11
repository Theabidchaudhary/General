/**
 * Structured, namespaced logging with an in-memory ring buffer so the UI can
 * surface recent log entries for observability without any remote telemetry.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  namespace: string;
  message: string;
  detail?: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const RING_BUFFER_SIZE = 500;
const ringBuffer: LogEntry[] = [];

let minLevel: LogLevel = 'debug';

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

/** Returns the most recent log entries, newest last. */
export function getRecentLogs(limit = RING_BUFFER_SIZE): LogEntry[] {
  return ringBuffer.slice(-limit);
}

export function clearLogs(): void {
  ringBuffer.length = 0;
}

export interface Logger {
  debug(message: string, detail?: unknown): void;
  info(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
  child(namespace: string): Logger;
}

function record(namespace: string, level: LogLevel, message: string, detail?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const entry: LogEntry = { timestamp: Date.now(), level, namespace, message };
  if (detail !== undefined) entry.detail = detail;
  ringBuffer.push(entry);
  if (ringBuffer.length > RING_BUFFER_SIZE) ringBuffer.shift();
  const line = `[${namespace}] ${message}`;
  if (level === 'error') console.error(line, detail ?? '');
  else if (level === 'warn') console.warn(line, detail ?? '');
  else if (level === 'info') console.info(line, detail ?? '');
  else console.debug(line, detail ?? '');
}

export function createLogger(namespace: string): Logger {
  return {
    debug: (message, detail) => record(namespace, 'debug', message, detail),
    info: (message, detail) => record(namespace, 'info', message, detail),
    warn: (message, detail) => record(namespace, 'warn', message, detail),
    error: (message, detail) => record(namespace, 'error', message, detail),
    child: (sub) => createLogger(`${namespace}:${sub}`),
  };
}
