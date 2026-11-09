import { createFileRoute } from "@tanstack/react-router";
import { requireRole } from "@/features/auth";
import { DataIndexPage } from "@/features/data";

/** Club staff and system admins; for players the page doesn't exist. */
export const Route = createFileRoute("/_app/data/")({
  beforeLoad: ({ context }) => requireRole(context.user, "SYSTEM_ADMIN", "CLUB_ADMIN", "COACH"),
  component: DataIndexPage,
});
