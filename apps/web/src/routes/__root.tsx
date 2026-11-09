import { createRootRouteWithContext, Outlet, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import type { AppContext } from "@/app/context";
import { type AuthState, loadAuth } from "@/features/auth";
import { InstalledToast } from "@/features/install";
import { NetworkActivity } from "@/shared/components/network-activity";
import { NotFoundFallback } from "@/shared/fallbacks";
import { Toaster } from "@/shared/ui/sonner";

export interface RouterContext extends AppContext {
  readonly auth: AuthState;
}

/**
 * The root resolves the session before any child guard runs, so no guard ever sees "still loading" (the async auth
 * race). A returning user starts from their snapshot at once; the API is asked in the background.
 */
export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context }) => ({ auth: await loadAuth(context) }),
  component: Root,
  notFoundComponent: NotFoundFallback,
});

function Root() {
  const router = useRouter();
  // Connection back: ask the server again (guards, loaders, stale queries).
  useEffect(() => {
    const online = () => void router.invalidate();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [router]);
  return (
    <>
      <Outlet />
      <NetworkActivity />
      <InstalledToast />
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
