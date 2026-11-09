import type { Role } from "@/identity/user";
import { type Actor, isSystemAdmin } from "@/shared/actor";

/** Roles that only mean something inside a club. Leaving a club drops them. */
export const CLUB_ROLES = ["CLUB_ADMIN", "COACH", "PLAYER"] as const satisfies readonly Role[];
export type ClubRole = (typeof CLUB_ROLES)[number];

export const isClubRole = (role: Role): role is ClubRole => (CLUB_ROLES as readonly Role[]).includes(role);

/**
 * The two kinds of account. A **system admin** runs the platform: never in a club, never a player (no games, no
 * rating). **Everyone else** is a player of at most one club, optionally also its coach and/or club admin.
 */
export function accountRoles(requested: readonly Role[]): Role[] {
  if (requested.includes("SYSTEM_ADMIN")) return ["SYSTEM_ADMIN"];
  return clubMemberRoles(requested);
}

/** Roles inside a club: always player, plus coach / club admin when asked. SYSTEM_ADMIN can't be given here. */
export const clubMemberRoles = (requested: readonly Role[]): Role[] => CLUB_ROLES.filter((r) => r === "PLAYER" || requested.includes(r));

/** What a member keeps when they leave their club. */
export const rolesAfterLeavingClub = (_roles: readonly Role[]): Role[] => ["PLAYER"];

/** A system admin can't be in a club. Returns the problem, or null. */
export const accountShapeProblem = (roles: readonly Role[], clubId: string | null): string | null =>
  roles.includes("SYSTEM_ADMIN") && clubId ? "A system admin isn't a member of any club: take them out of the club first." : null;

/**
 * A club must keep at least one club admin, or nobody but a system admin could manage it again. Returns the problem,
 * or null when the change is fine.
 */
export function lastAdminProblem(
  actor: Actor,
  members: readonly { id: string; roles: readonly Role[] }[],
  memberId: string,
  nextRoles: readonly Role[] | null,
): string | null {
  if (isSystemAdmin(actor)) return null;
  const admins = members.filter((m) => m.roles.includes("CLUB_ADMIN"));
  const target = admins.find((m) => m.id === memberId);
  if (!target || admins.length > 1) return null;
  if (nextRoles?.includes("CLUB_ADMIN")) return null;
  return "A club needs at least one club admin. Make someone else an admin first.";
}
