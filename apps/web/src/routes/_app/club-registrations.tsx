import { createFileRoute, notFound } from "@tanstack/react-router";
import { requireRole, useSessionUser } from "@/features/auth";
import { ClubRegistrationsPage } from "@/features/registrations";

/** Club admins (and system admins who are in a club): the season's registrations. `member` opens one member's sheet. */
export const Route = createFileRoute("/_app/club-registrations")({
  beforeLoad: ({ context }) => {
    requireRole(context.user, "SYSTEM_ADMIN", "CLUB_ADMIN");
    if (!context.user.clubId) throw notFound();
  },
  validateSearch: (search: Record<string, unknown>): { member?: string } => ({
    member: typeof search.member === "string" && /^[a-f0-9]{24}$/.test(search.member) ? search.member : undefined,
  }),
  component: ClubRegistrations,
});

function ClubRegistrations() {
  const { member } = Route.useSearch();
  return <ClubRegistrationsPage clubId={useSessionUser().clubId as string} member={member} />;
}
