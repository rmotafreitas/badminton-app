import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { LoginPage } from "@/features/auth/components/login-page";
import { safeRedirect, startSession } from "@/features/auth";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search.redirect === "string" ? { redirect: search.redirect } : {},
  beforeLoad: ({ context, search }) => {
    if (context.auth.kind === "signed-in") throw redirect({ to: safeRedirect(search.redirect), replace: true });
  },
  component: Login,
});

function Login() {
  const router = useRouter();
  const search = Route.useSearch();
  const context = Route.useRouteContext();
  return (
    <LoginPage
      onSignedIn={async (user) => {
        await startSession(context, user);
        await router.invalidate();
        router.history.replace(safeRedirect(search.redirect));
      }}
    />
  );
}
