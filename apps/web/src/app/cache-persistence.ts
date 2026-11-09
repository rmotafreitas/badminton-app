import type { Query, QueryClient } from "@tanstack/react-query";
import { type PersistedClient, type Persister, persistQueryClient } from "@tanstack/react-query-persist-client";
import { createStore, del, get, keys, set } from "idb-keyval";

/** Bump when the shape of anything persisted changes: older data is then dropped instead of misread. */
export const CACHE_SCHEMA_VERSION = 1;
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;
/** One entry per signed-in user: nothing is ever shared between accounts on one device. */
const KEY_PREFIX = "bb:query-cache:";

declare module "@tanstack/react-query" {
  interface Register {
    /** `persist: true` is the allow-list entry; a query without it never leaves memory. */
    queryMeta: { persist?: boolean };
  }
}

const shouldPersist = (query: Query): boolean => query.meta?.persist === true && query.state.status === "success";

export interface CachePersistence {
  readonly userId: string | undefined;
  /** Restore this user's persisted queries, then keep writing the allow-listed ones. Idempotent per user. */
  attach(queryClient: QueryClient, userId: string): Promise<void>;
  /** Stop writing, then delete every user's persisted data. */
  wipe(): Promise<void>;
}

/**
 * Persisted query cache in IndexedDB: a cold start (or a Vercel cold start on the API) paints the last known club,
 * games and profile at once while queries revalidate in the background.
 */
export function createCachePersistence(): CachePersistence {
  const store = (() => {
    try {
      return createStore("badminton-buddy", "query-cache");
    } catch {
      return undefined;
    }
  })();
  let current: { userId: string; unsubscribe: () => void; stop: () => void; settled: () => Promise<void> } | undefined;

  async function detach() {
    const attachment = current;
    current = undefined;
    if (!attachment) return;
    attachment.stop();
    attachment.unsubscribe();
    await attachment.settled();
  }

  return {
    get userId() {
      return current?.userId;
    },
    async attach(queryClient, userId) {
      if (!store || current?.userId === userId) return;
      await detach();
      const key = `${KEY_PREFIX}${userId}`;
      let stopped = false;
      let chain: Promise<void> = Promise.resolve();
      const persister: Persister = {
        persistClient: (client: PersistedClient) => {
          if (stopped) return; // after sign-out nothing may be written, not even a late cache event
          chain = chain.then(() => set(key, client, store)).catch(() => undefined);
        },
        restoreClient: async () => (await get(key, store).catch(() => undefined)) as PersistedClient | undefined,
        removeClient: () => {
          chain = chain.then(() => del(key, store)).catch(() => undefined);
        },
      };
      const [unsubscribe, restored] = persistQueryClient({
        queryClient,
        persister,
        buster: `schema${CACHE_SCHEMA_VERSION}`,
        maxAge: MAX_AGE_MS,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
      });
      current = { userId, unsubscribe, stop: () => (stopped = true), settled: () => chain };
      await restored.catch(() => undefined); // an unreadable cache is an empty cache
    },
    async wipe() {
      await detach();
      if (!store) return;
      const all = await keys(store).catch(() => [] as IDBValidKey[]);
      await Promise.all(all.filter((k) => String(k).startsWith(KEY_PREFIX)).map((k) => del(k, store)));
    },
  };
}
