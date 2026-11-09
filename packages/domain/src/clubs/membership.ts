import type { Role } from "@/identity/user";
import { type Actor, isSystemAdmin } from "@/shared/actor";

/** Roles that only mean something inside a club. Leaving a club drops them. */
export const CLUB_ROLES = ["CLUB_ADMIN", "COACH", "PLAYER"] as const satisfies readonly Role[];
export type ClubRole = (typeof CLUB_ROLES)[number];

export const isClubRole = (role: Role): role is ClubRole => (CLUB_ROLES as readonly Role[]).includes(role);

/**
 * The roles a member ends up with after `actor` asks for `requested`. Everyone keeps PLAYER. SYSTEM_ADMIN is
 * platform-wide: only a system admin may grant or remove it, so anyone else's request keeps whatever the member had.
 */
export function nextMemberRoles(actor: Actor, current: readonly Role[], requested: readonly Role[]): Role[] {
  const wantsSystem = requested.includes("SYSTEM_ADMIN");
  const system = isSystemAdmin(actor) ? wantsSystem : current.includes("SYSTEM_ADMIN");
  const club = CLUB_ROLES.filter((r) => r === "PLAYER" || requested.includes(r));
  return system ? ["SYSTEM_ADMIN", ...club] : [...club];
}

/** What a member keeps when they leave their club (club roles go, platform roles stay). */
export const rolesAfterLeavingClub = (roles: readonly Role[]): Role[] =>
  roles.includes("SYSTEM_ADMIN") ? ["SYSTEM_ADMIN", "PLAYER"] : ["PLAYER"];

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
