import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isApiError, isClientError, NetworkError } from "./api";

/**
 * How long data counts as fresh, by class. Persisted or cached data always paints at once; staleness only decides
 * whether a background refetch runs.
 */
export const staleTime = {
  /** Lists and details other people can change (club roster, club games). */
  shared: 30_000,
  /** What the user changes themselves: mutations invalidate it, so it can stay fresh a little longer. */
  own: 60_000,
} as const;

const MAX_RETRIES = 3;

/** A 4xx is a definite answer; network errors, 429 and 5xx (Vercel cold starts) retry with backoff — but not offline. */
export const retryPolicy = (failureCount: number, error: unknown): boolean =>
  !isClientError(error) && failureCount < MAX_RETRIES && (navigator.onLine || !(error instanceof NetworkError));

const retryDelay = (attempt: number): number => Math.min(800 * 2 ** attempt, 10_000);

/** The one QueryClient of the app. Server state lives here and nowhere else (no hand-written cache, ever). */
export function createQueryClient({ onUnauthenticated }: { onUnauthenticated: () => void }): QueryClient {
  const onError = (error: unknown) => {
    if (isApiError(error, 401)) onUnauthenticated();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: { retry: retryPolicy, retryDelay, staleTime: staleTime.shared, gcTime: 10 * 60_000, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}
