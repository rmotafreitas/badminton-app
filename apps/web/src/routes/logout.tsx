import { createFileRoute, redirect } from "@tanstack/react-router";
import { signOut } from "@/features/auth";

/** `/logout` (old bookmarks and PWA shortcuts): sign out, then the login page. */
export const Route = createFileRoute("/logout")({
  beforeLoad: async ({ context }) => {
    await signOut(context);
    throw redirect({ to: "/login", replace: true });
  },
});
