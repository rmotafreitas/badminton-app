import { createFileRoute } from "@tanstack/react-router";
import { requireRole } from "@/features/auth";
import { ClubsPage } from "@/features/clubs";

/** System admins only; for anyone else the page doesn't exist. */
export const Route = createFileRoute("/_app/clubs")({
  beforeLoad: ({ context }) => requireRole(context.user, "SYSTEM_ADMIN"),
  component: ClubsPage,
});
