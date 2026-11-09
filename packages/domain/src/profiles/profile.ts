import type { Role } from "@/identity/user";
import { type Actor, isClubStaff, isSameClub, isSystemAdmin } from "@/shared/actor";

export interface Profile {
  readonly userId: string;
  readonly name: string;
  readonly birthday: Date | null;
  readonly sex: string | null;
  readonly bio: string | null;
  readonly photoVersion: string | null;
  readonly bannerVersion: string | null;
  readonly updatedAt: Date;
}

/** A profile joined with the account facts the profile page shows. */
export interface PlayerProfile extends Profile {
  readonly email: string | null;
  readonly phone: string | null;
  readonly roles: readonly Role[];
  readonly clubId: string | null;
  readonly eloSingles: number;
  readonly eloDoubles: number;
  readonly memberSince: Date;
}

/**
 * Email and phone are personal: the person themself, system admins, and staff of the same club see them; other
 * players don't.
 */
export const canSeeContactDetails = (actor: Actor, target: { userId: string; clubId: string | null }): boolean =>
  actor.userId === target.userId || isSystemAdmin(actor) || (isClubStaff(actor) && isSameClub(actor, target.clubId));
