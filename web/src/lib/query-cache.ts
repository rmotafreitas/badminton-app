/**
 * QueryCache — framework-agnostic stale-while-revalidate cache.
 *
 * Lives at the data-layer boundary (used by `useQuery` in React, and available
 * to services/repos). Provides:
 *   - in-memory cache with per-entry TTL + GC time
 *   - optional persistence to localStorage (for cold-start instant paint)
 *   - stale-while-revalidate reads (serve stale, refetch in background)
 *   - prefix + predicate invalidation
 *   - subscriber notifications (so React can re-render on cache changes)
 *
 * The auth token is NEVER cached here (it lives in an httpOnly cookie).
 */

export type QueryKey = readonly (string | number)[];
export type Fetcher<T> = () => Promise<T>;

export interface CacheOptions {
  /** Time (ms) the entry is considered fresh. Default 30_000. */
  staleTime?: number;
  /** Time (ms) after which an entry is dropped entirely. Default 300_000. */
  gcTime?: number;
  /** Mirror the entry to localStorage so it survives reloads. Default false. */
  persist?: boolean;
}

interface Entry<T = unknown> {
  data: T;
  error?: unknown;
  updatedAt: number;
  staleTime: number;
  gcTime: number;
  persist: boolean;
  /** In-flight fetch promise, to dedupe concurrent reads of the same key. */
  promise?: Promise<T>;
}

type Listener = () => void;

const STORAGE_PREFIX = "badminton-q:";
const STORAGE_VERSION_KEY = "badminton-q:__v";
const STORAGE_VERSION = 1;

function serializeKey(key: QueryKey): string {
  return key.map(String).join("/");
}

function nowMs(): number {
  return Date.now();
}

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota / private mode — ignore */
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

class QueryCacheImpl {
  private entries = new Map<string, Entry>();
  private listeners = new Map<string, Set<Listener>>();
  private globalListeners = new Set<Listener>();
  private bootstrapped = false;

  /** Default options applied when an entry is first created. */
  readonly defaults: Required<CacheOptions> = {
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    persist: false,
  };

  /** Load persisted entries from localStorage exactly once. */
  private bootstrap(): void {
    if (this.bootstrapped) return;
    this.bootstrapped = true;
    try {
      const storedVersion = safeGetItem(STORAGE_VERSION_KEY);
      if (storedVersion !== String(STORAGE_VERSION)) {
        // Version mismatch — clear stale persisted cache.
        this.clearPersisted();
        safeSetItem(STORAGE_VERSION_KEY, String(STORAGE_VERSION));
        return;
      }
      const keysJson = safeGetItem(`${STORAGE_PREFIX}__keys`);
      if (!keysJson) return;
      const keys: string[] = JSON.parse(keysJson);
      const cutoff = nowMs();
      for (const key of keys) {
        const raw = safeGetItem(`${STORAGE_PREFIX}${key}`);
        if (!raw) continue;
        const parsed: Entry = JSON.parse(raw);
        if (cutoff - parsed.updatedAt > parsed.gcTime) {
          safeRemoveItem(`${STORAGE_PREFIX}${key}`);
          continue;
        }
        // Don't restore in-flight promises.
        parsed.promise = undefined;
        this.entries.set(key, parsed);
      }
    } catch {
      /* corrupt cache — ignore */
    }
  }

  private persistEntry(key: string, entry: Entry): void {
    if (!entry.persist) return;
    safeSetItem(
      `${STORAGE_PREFIX}${key}`,
      JSON.stringify({ ...entry, promise: undefined }),
    );
    // Maintain the key index.
    const keysJson = safeGetItem(`${STORAGE_PREFIX}__keys`);
    const keys: string[] = keysJson ? JSON.parse(keysJson) : [];
    if (!keys.includes(key)) {
      keys.push(key);
      safeSetItem(`${STORAGE_PREFIX}__keys`, JSON.stringify(keys));
    }
  }

  private clearPersisted(): void {
    try {
      const keysJson = safeGetItem(`${STORAGE_PREFIX}__keys`);
      const keys: string[] = keysJson ? JSON.parse(keysJson) : [];
      for (const key of keys) safeRemoveItem(`${STORAGE_PREFIX}${key}`);
      safeRemoveItem(`${STORAGE_PREFIX}__keys`);
    } catch {
      /* ignore */
    }
  }

  private removePersisted(key: string): void {
    safeRemoveItem(`${STORAGE_PREFIX}${key}`);
    const keysJson = safeGetItem(`${STORAGE_PREFIX}__keys`);
    if (!keysJson) return;
    const keys: string[] = JSON.parse(keysJson);
    const next = keys.filter((k) => k !== key);
    if (next.length !== keys.length) {
      safeSetItem(`${STORAGE_PREFIX}__keys`, JSON.stringify(next));
    }
  }

  private notify(key: string): void {
    this.listeners.get(key)?.forEach((l) => l());
    this.globalListeners.forEach((l) => l());
  }

  subscribe(key: string, listener: Listener): () => void {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set && set.size === 0) this.listeners.delete(key);
    };
  }

  subscribeAll(listener: Listener): () => void {
    this.globalListeners.add(listener);
    return () => this.globalListeners.delete(listener);
  }

  /** Snapshot for a key — used by `useQuery` to seed initial state. */
  getSnapshot<T>(key: QueryKey): { data: T | undefined; isStale: boolean } {
    this.bootstrap();
    const k = serializeKey(key);
    const entry = this.entries.get(k);
    if (!entry) return { data: undefined, isStale: true };
    return {
      data: entry.data as T | undefined,
      isStale: nowMs() - entry.updatedAt > entry.staleTime,
    };
  }

  /**
   * Read with stale-while-revalidate semantics.
   * - fresh  → return cached data (no fetch)
   * - stale  → return cached data AND trigger a background fetch
   * - absent → fetch (returns the promise so the caller can await)
   */
  read<T>(
    key: QueryKey,
    fetcher: Fetcher<T>,
    opts: CacheOptions = {},
  ): { data: T | undefined; promise: Promise<T> | undefined } {
    this.bootstrap();
    const k = serializeKey(key);
    const staleTime = opts.staleTime ?? this.defaults.staleTime;
    const gcTime = opts.gcTime ?? this.defaults.gcTime;
    const persist = opts.persist ?? this.defaults.persist;

    const existing = this.entries.get(k);
    const age = existing ? nowMs() - existing.updatedAt : Infinity;

    // Fresh — serve immediately.
    if (existing && age <= existing.staleTime) {
      return { data: existing.data as T, promise: undefined };
    }

    // Stale but still within GC — serve cached, refetch in background.
    if (existing && age <= existing.gcTime) {
      if (!existing.promise) {
        this.runFetch<T>(k, fetcher, staleTime, gcTime, persist);
      }
      return { data: existing.data as T, promise: undefined };
    }

    // Absent or expired — fetch (deduped).
    if (existing?.promise) {
      return { data: undefined, promise: existing.promise as Promise<T> };
    }
    const promise = this.runFetch<T>(k, fetcher, staleTime, gcTime, persist);
    return { data: undefined, promise };
  }

  private runFetch<T>(
    key: string,
    fetcher: Fetcher<T>,
    staleTime: number,
    gcTime: number,
    persist: boolean,
  ): Promise<T> {
    const promise = fetcher()
      .then((data) => {
        const entry: Entry<T> = {
          data,
          updatedAt: nowMs(),
          staleTime,
          gcTime,
          persist,
        };
        this.entries.set(key, entry as Entry);
        this.persistEntry(key, entry as Entry);
        this.notify(key);
        return data;
      })
      .catch((error) => {
        // Keep prior data if we have it; record the error for callers.
        const prev = this.entries.get(key);
        if (prev) {
          prev.error = error;
          this.notify(key);
        } else {
          this.entries.set(key, {
            data: undefined,
            error,
            updatedAt: nowMs(),
            staleTime,
            gcTime,
            persist,
          } as Entry);
        }
        throw error;
      })
      .finally(() => {
        const e = this.entries.get(key);
        if (e) e.promise = undefined;
      });

    const entry = this.entries.get(key);
    if (entry) {
      entry.promise = promise as Promise<unknown>;
    } else {
      this.entries.set(
        key,
        {
          data: undefined,
          updatedAt: nowMs(),
          staleTime,
          gcTime,
          persist,
          promise: promise as Promise<unknown>,
        } as Entry,
      );
    }
    return promise;
  }

  /** Imperatively write a value (e.g. optimistic update). */
  set<T>(key: QueryKey, data: T, opts: CacheOptions = {}): void {
    const k = serializeKey(key);
    const staleTime = opts.staleTime ?? this.defaults.staleTime;
    const gcTime = opts.gcTime ?? this.defaults.gcTime;
    const persist = opts.persist ?? this.defaults.persist;
    const entry: Entry<T> = { data, updatedAt: nowMs(), staleTime, gcTime, persist };
    this.entries.set(k, entry as Entry);
    this.persistEntry(k, entry as Entry);
    this.notify(k);
  }

  /** Warm the cache without subscribing. */
  prefetch<T>(key: QueryKey, fetcher: Fetcher<T>, opts?: CacheOptions): void {
    this.read(key, fetcher, opts);
  }

  /** True if a fetch is currently in flight for the key. */
  isFetching(key: QueryKey): boolean {
    this.bootstrap();
    const k = serializeKey(key);
    return !!this.entries.get(k)?.promise;
  }

  /** True if a fresh-or-stale entry exists for the key. */
  has(key: QueryKey): boolean {
    this.bootstrap();
    const k = serializeKey(key);
    const entry = this.entries.get(k);
    if (!entry) return false;
    return nowMs() - entry.updatedAt <= entry.gcTime;
  }

  /** Remove entries matching a predicate over the key segments. */
  invalidate(
    target: QueryKey | ((key: QueryKey) => boolean),
  ): void {
    this.bootstrap();
    const predicate =
      typeof target === "function"
        ? (target as (key: QueryKey) => boolean)
        : (key: QueryKey) => {
            const t = target as QueryKey;
            if (key.length < t.length) return false;
            return t.every((seg, i) => String(key[i]) === String(seg));
          };

    const removed: string[] = [];
    for (const k of Array.from(this.entries.keys())) {
      // Re-hydrate the key segments from the serialized form for the predicate.
      const segs = k.split("/").map((s) => s);
      if (predicate(segs)) {
        this.entries.delete(k);
        this.removePersisted(k);
        removed.push(k);
      }
    }
    removed.forEach((k) => this.notify(k));
  }

  /** Remove a single exact key. */
  remove(key: QueryKey): void {
    const k = serializeKey(key);
    if (this.entries.delete(k)) {
      this.removePersisted(k);
      this.notify(k);
    }
  }

  /** Clear everything (memory + persisted). */
  clear(): void {
    this.entries.clear();
    this.clearPersisted();
    this.globalListeners.forEach((l) => l());
    this.listeners.forEach((set) => set.forEach((l) => l()));
  }
}

export const queryCache = new QueryCacheImpl();
export { serializeKey as serializeQueryKey };
