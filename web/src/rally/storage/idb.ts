/**
 * Minimal promise wrapper around IndexedDB, usable from the main thread and
 * workers. One database for all Rally Analysis local state.
 */

const DB_NAME = "rally-analysis";
const DB_VERSION = 3;

export const STORES = {
  /** Local session records (metadata, status, result, corrections). */
  sessions: "sessions",
  /** Video blobs not yet uploaded (and kept for offline review). */
  videos: "videos",
  /** Analysis checkpoints, keyed by session id. */
  checkpoints: "checkpoints",
  /** Full analysis results (AnalysisResult), keyed by client id. */
  results: "results",
  /** Players-removed still frames (JPEG) for the court check. */
  frames: "frames",
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idbGet = <T>(store: StoreName, key: string) =>
  tx<T | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
export const idbPut = <T>(store: StoreName, key: string, value: T) =>
  tx(store, "readwrite", (s) => s.put(value, key)).then(() => undefined);
export const idbDelete = (store: StoreName, key: string) =>
  tx(store, "readwrite", (s) => s.delete(key)).then(() => undefined);
export const idbAll = <T>(store: StoreName) => tx<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
export const idbKeys = (store: StoreName) =>
  tx<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys()).then((k) => k.map(String));

/** Ask the browser not to evict our data (iOS/Safari evicts aggressively). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
