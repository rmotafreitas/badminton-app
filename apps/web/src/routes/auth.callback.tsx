import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { completeSignIn, startSession } from "@/features/auth";
import { Brand } from "@/shared/components/logo";
import { useDictionary } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

/** The magic link from the sign-in email lands here: `/auth/callback?provider=email&token=…`. */
export const Route = createFileRoute("/auth/callback")({
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === "string" ? { token: search.token } : {},
  component: MagicLink,
});

function MagicLink() {
  const dict = useDictionary().ui;
  const { token } = Route.useSearch();
  const context = Route.useRouteContext();
  const router = useRouter();
  const [failed, setFailed] = useState(!token);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // a link works once: never redeem it twice (StrictMode runs effects twice)
    completeSignIn(context.api, { provider: "email", token })
      .then(async (user) => {
        await startSession(context, user);
        await router.invalidate();
        router.history.replace("/dashboard");
      })
      .catch(() => setFailed(true));
  }, [token, context, router]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <Brand />
      {failed ? (
        <div className="space-y-4">
          <CircleAlert className="mx-auto size-10 text-destructive" />
          <p className="text-muted-foreground">{dict.login.callbackFailed}</p>
          <Button asChild>
            <Link to="/login">{dict.login.backToLogin}</Link>
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Spinner /> {dict.login.callbackTitle}
        </p>
      )}
    </div>
  );
}
