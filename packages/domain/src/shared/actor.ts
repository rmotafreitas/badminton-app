import type { Role } from "@/identity/user";

/**
 * Who is making a request, resolved from the session on every request. Roles and club come from the database at
 * that moment, so a role change or a club move applies at once (no stale token claims).
 */
export interface Actor {
  readonly userId: string;
  readonly sessionId: string;
  readonly roles: readonly Role[];
  readonly clubId: string | null;
}

export const isSystemAdmin = (actor: Pick<Actor, "roles">): boolean => actor.roles.includes("SYSTEM_ADMIN");

/** Coach or club admin: may see and manage everything inside their own club. */
export const isClubStaff = (actor: Pick<Actor, "roles">): boolean =>
  actor.roles.includes("CLUB_ADMIN") || actor.roles.includes("COACH");

export const isSameClub = (actor: Pick<Actor, "clubId">, clubId: string | null): boolean =>
  actor.clubId !== null && clubId !== null && actor.clubId === clubId;
