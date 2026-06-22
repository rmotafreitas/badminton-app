import { useCallback, useEffect, useRef, useState } from "react";
import {
  queryCache,
  type CacheOptions,
  type Fetcher,
  type QueryKey,
} from "@/lib/query-cache";

export interface UseQueryOptions extends CacheOptions {
  /** When false, the query is paused (no fetch, no subscription). Default true. */
  enabled?: boolean;
  /** Refetch on window focus. Default true. */
  refetchOnFocus?: boolean;
  /** Refetch when the browser goes back online. Default true. */
  refetchOnOnline?: boolean;
  /** Called when the fetcher rejects. */
  onError?: (error: unknown) => void;
  /** Keep previous data visible while refetching after a key change. */
  keepPreviousData?: boolean;
}

export interface UseQueryResult<T> {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
  isFetching: boolean;
  isStale: boolean;
  refetch: () => void;
}

/**
 * Subscribe a component to a cached query. Implements stale-while-revalidate
 * on top of `queryCache`, plus focus/online refetch.
 *
 * All values read inside the stable `runFetch`/subscriber callbacks are kept in
 * refs so the callbacks have stable identity and effects only re-run when the
 * serialized key actually changes (not on every render).
 */
export function useQuery<T>(
  key: QueryKey,
  fetcher: Fetcher<T>,
  options: UseQueryOptions = {},
): UseQueryResult<T> {
  const {
    enabled = true,
    refetchOnFocus = true,
    refetchOnOnline = true,
    onError,
    keepPreviousData = false,
    ...cacheOpts
  } = options;

  const keyStr = key.map(String).join("/");

  // Latest-value refs (updated in effects to comply with react-hooks/refs).
  const fetcherRef = useRef(fetcher);
  const optsRef = useRef(cacheOpts);
  const onErrorRef = useRef(onError);
  const keyRef = useRef(key);
  const enabledRef = useRef(enabled);
  const keepPreviousDataRef = useRef(keepPreviousData);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  useEffect(() => {
    optsRef.current = cacheOpts;
  });
  useEffect(() => {
    onErrorRef.current = onError;
  });
  useEffect(() => {
    keyRef.current = key;
  });
  useEffect(() => {
    enabledRef.current = enabled;
  });
  useEffect(() => {
    keepPreviousDataRef.current = keepPreviousData;
  });

  // Seed from the cache snapshot so the first paint is not always loading.
  const [state, setState] = useState(() => {
    if (!enabled) {
      return { data: undefined as T | undefined, error: undefined, isFetching: false };
    }
    const snap = queryCache.getSnapshot<T>(key);
    return {
      data: snap.data,
      error: undefined,
      isFetching: !snap.data && snap.isStale,
    };
  });

  // KeepPreviousData: remember the last non-empty data so it stays visible
  // while refetching after a key change.
  const previousDataRef = useRef<T | undefined>(state.data);
  useEffect(() => {
    if (keepPreviousData && state.data !== undefined) {
      previousDataRef.current = state.data;
    }
  }, [state.data, keepPreviousData]);

  // Stable fetcher: reads latest key/opts/fetcher from refs.
  const runFetch = useCallback(() => {
    const k = keyRef.current;
    if (!enabledRef.current) return;
    const { data, promise } = queryCache.read<T>(
      k,
      () => fetcherRef.current(),
      optsRef.current,
    );
    if (data !== undefined) {
      setState({ data, error: undefined, isFetching: !!promise });
    } else {
      setState((prev) => ({
        data: keepPreviousDataRef.current ? previousDataRef.current : prev.data,
        error: undefined,
        isFetching: true,
      }));
    }
    if (promise) {
      promise
        .then((d) => {
          setState({ data: d, error: undefined, isFetching: false });
        })
        .catch((err) => {
          setState((prev) => ({ data: prev.data, error: err, isFetching: false }));
          onErrorRef.current?.(err);
        });
    }
  }, []);

  // Initial fetch + re-fetch when the key (or enabled) changes.
  useEffect(() => {
    if (!enabled) return;
    runFetch();
  }, [enabled, keyStr, runFetch]);

  // Subscribe to cache notifications for this key (cross-component updates).
  useEffect(() => {
    if (!enabled) return;
    return queryCache.subscribe(keyStr, () => {
      const k = keyRef.current;
      const snap = queryCache.getSnapshot<T>(k);
      setState((prev) => ({
        data: snap.data ?? (keepPreviousDataRef.current ? previousDataRef.current : prev.data),
        error: undefined,
        isFetching: queryCache.isFetching(k),
      }));
    });
  }, [enabled, keyStr]);

  // Refetch on focus / online (only if stale, to avoid hammering).
  useEffect(() => {
    if (!enabled || (!refetchOnFocus && !refetchOnOnline)) return;
    const handler = () => {
      const snap = queryCache.getSnapshot<T>(keyRef.current);
      if (snap.isStale) runFetch();
    };
    if (refetchOnFocus) {
      window.addEventListener("visibilitychange", handler);
    }
    if (refetchOnOnline) {
      window.addEventListener("online", handler);
    }
    return () => {
      if (refetchOnFocus) window.removeEventListener("visibilitychange", handler);
      if (refetchOnOnline) window.removeEventListener("online", handler);
    };
  }, [enabled, keyStr, refetchOnFocus, refetchOnOnline, runFetch]);

  const snap = queryCache.getSnapshot<T>(key);

  return {
    data: state.data,
    error: state.error,
    isLoading: enabled && state.data === undefined && state.isFetching,
    isFetching: state.isFetching,
    isStale: snap.isStale,
    refetch: runFetch,
  };
}

export interface UseMutationOptions<TData, TVariables> {
  /** Keys (or predicates) to invalidate after a successful mutation. */
  invalidate?: (variables: TVariables, data: TData) => QueryKey[];
  /** Runs after success — e.g. refresh the auth user. */
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
  onError?: (error: unknown, variables: TVariables) => void;
}

export interface UseMutationResult<TData, TVariables> {
  mutate: (variables: TVariables) => Promise<TData>;
  isPending: boolean;
  error: unknown;
}

/**
 * `useMutation` runs an async action, then invalidates dependent cache keys
 * (and optionally refreshes the auth user) so dependent pages resync.
 */
export function useMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: UseMutationOptions<TData, TVariables> = {},
): UseMutationResult<TData, TVariables> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData> => {
      setIsPending(true);
      setError(undefined);
      try {
        const data = await mutationFn(variables);
        const opts = optionsRef.current;
        const keys = opts.invalidate?.(variables, data) ?? [];
        for (const key of keys) {
          queryCache.invalidate(key);
        }
        await opts.onSuccess?.(data, variables);
        return data;
      } catch (err) {
        setError(err);
        optionsRef.current.onError?.(err, variables);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [mutationFn],
  );

  return { mutate, isPending, error };
}

/** Invalidate one or more keys/predicates. */
export function invalidateQueries(
  ...targets: (QueryKey | ((key: QueryKey) => boolean))[]
): void {
  for (const target of targets) queryCache.invalidate(target);
}

/** Warm a query into the cache without subscribing. */
export function prefetchQuery<T>(
  key: QueryKey,
  fetcher: Fetcher<T>,
  options?: CacheOptions,
): void {
  queryCache.prefetch(key, fetcher, options);
}

/** Imperatively write a value into the cache. */
export function setQueryData<T>(
  key: QueryKey,
  data: T,
  options?: CacheOptions,
): void {
  queryCache.set(key, data, options);
}

export { queryCache };
