import { createFileRoute, notFound } from "@tanstack/react-router";
import { requireRole, useSessionUser } from "@/features/auth";
import { ClubRegistrationsPage } from "@/features/registrations";

/** Club admins (and system admins who are in a club): the season's registrations. */
export const Route = createFileRoute("/_app/club-registrations")({
  beforeLoad: ({ context }) => {
    requireRole(context.user, "SYSTEM_ADMIN", "CLUB_ADMIN");
    if (!context.user.clubId) throw notFound();
  },
  component: () => <ClubRegistrationsPage clubId={useSessionUser().clubId as string} />,
});
