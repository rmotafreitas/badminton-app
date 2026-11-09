import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireUser, useSessionUser } from "@/features/auth";
import { AppShell } from "@/features/shell";

/**
 * Everything behind a sign-in. The guard is UX, not a data boundary: every API route enforces authentication and
 * authorization itself.
 */
export const Route = createFileRoute("/_app")({
  beforeLoad: (options) => ({ user: requireUser(options) }),
  component: AppLayout,
});

function AppLayout() {
  const user = useSessionUser();
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  );
}
