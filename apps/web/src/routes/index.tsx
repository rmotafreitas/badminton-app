import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    throw redirect({ to: context.auth.kind === "signed-in" ? "/dashboard" : "/login", replace: true });
  },
});
