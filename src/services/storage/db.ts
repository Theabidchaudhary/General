/**
 * Single shared IndexedDB connection for all durable stores. Every object
 * store used by any *Store implementation must be declared here so a single
 * onupgradeneeded handler creates them together — opening the same database
 * name at different versions from different modules throws a VersionError.
 */

export const DB_NAME = 'ai-workflow-studio';
const DB_VERSION = 3;

export const STORE_NAMES = {
  jobs: 'jobs',
  templates: 'templates',
  downloads: 'downloads',
} as const;

let dbPromise: Promise<IDBDatabase> | undefined;

export function openDatabase(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of Object.values(STORE_NAMES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
  return dbPromise;
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}
