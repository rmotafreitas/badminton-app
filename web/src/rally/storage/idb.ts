/**
 * Minimal promise wrapper around IndexedDB, usable from the main thread and
 * workers. One database for all Rally Analysis local state.
 */

const DB_NAME = "rally-analysis";
const DB_VERSION = 4;

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
  /** In-progress recording chunks (see sessions/recording-buffer.ts). */
  recording: "recording",
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
    req.onsuccess = () => {
      const db = req.result;
      // A newer app version in another tab wants to upgrade: let it.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
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

/** How a Blob is kept where the browser can't store Blobs (see idbPutBlob). */
interface StoredBytes {
  __bytes: true;
  type: string;
  data: ArrayBuffer;
}

const isStoredBytes = (v: unknown): v is StoredBytes =>
  typeof v === "object" && v !== null && (v as StoredBytes).__bytes === true;

/**
 * Stores a Blob. WebKit refuses Blobs in IndexedDB in private browsing (and
 * some web views) — "Error preparing Blob/File data to be stored" — but takes
 * ArrayBuffers, so fall back to the bytes. Use idbGetBlob to read it back.
 */
export async function idbPutBlob(store: StoreName, key: string, blob: Blob): Promise<void> {
  try {
    await idbPut(store, key, blob);
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") throw e;
    const bytes: StoredBytes = { __bytes: true, type: blob.type, data: await blob.arrayBuffer() };
    await idbPut(store, key, bytes);
  }
}

export async function idbGetBlob(store: StoreName, key: string): Promise<Blob | undefined> {
  const v = await idbGet<Blob | StoredBytes>(store, key);
  if (isStoredBytes(v)) return new Blob([v.data], { type: v.type });
  return v;
}

/** Ask the browser not to evict our data (iOS/Safari evicts aggressively). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
