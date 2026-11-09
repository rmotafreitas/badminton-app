import type { SessionUser } from "@bb/contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { expireSession, sessionKey, sessionRevalidated } from "@/features/auth";
import { routeTree } from "@/routeTree.gen";
import { ErrorFallback, NotFoundFallback, PendingFallback } from "@/shared/fallbacks";
import { createApi } from "./api";
import { createCachePersistence } from "./cache-persistence";
import type { AppContext } from "./context";
import { createQueryClient } from "./query-client";

/** The composition root of the web app: one router, one query client, one API client. */
export function createAppRouter() {
  const api = createApi();
  const persistence = createCachePersistence();
  const queryClient = createQueryClient({
    // Global 401 policy: session null, user data gone, every guard re-runs (redirect to login with the return URL).
    onUnauthenticated: () => void expireSession(context, () => router.invalidate()),
  });
  const context: AppContext = { queryClient, api, persistence };

  // The background revalidation of the session (started from the snapshot) may find it gone.
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success" || event.query.queryKey[0] !== sessionKey[0]) return;
    // Only answers from the server count; our own setQueryData (sign-in, sign-out) is not a revalidation.
    if (event.action.manual) return;
    void sessionRevalidated(context, event.query.state.data as SessionUser | null).then((change) => {
      if (change === "expired") void expireSession(context, () => router.invalidate());
      if (change === "appeared") void router.invalidate();
    });
  });

  const router = createRouter({
    routeTree,
    context: { ...context, auth: { kind: "anonymous" } },
    // TanStack Query owns freshness; the router must not keep its own cache on top.
    defaultPreloadStaleTime: 0,
    defaultPreload: "intent",
    defaultPendingMs: 400,
    defaultPendingMinMs: 300,
    defaultPendingComponent: PendingFallback,
    defaultErrorComponent: ErrorFallback,
    defaultNotFoundComponent: NotFoundFallback,
    notFoundMode: "fuzzy",
    scrollRestoration: true,
  });
  return router;
}

export type AppRouter = ReturnType<typeof createAppRouter>;

export function AppRouterProvider({ router }: { router: AppRouter }) {
  return (
    <QueryClientProvider client={router.options.context.queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
