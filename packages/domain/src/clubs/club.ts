import type { Role } from "@/identity/user";
import { type Actor, isSameClub, isSystemAdmin } from "@/shared/actor";

export interface Club {
  readonly id: string;
  readonly name: string;
  readonly location: string | null;
  /** Content version of the stored picture/banner (null = none). Part of the image URL, so it can be cached forever. */
  readonly pictureVersion: string | null;
  readonly bannerVersion: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ClubMember {
  readonly id: string;
  readonly email: string | null;
  readonly roles: readonly Role[];
  readonly name: string | null;
  readonly photoVersion: string | null;
  readonly eloSingles: number;
  readonly eloDoubles: number;
  readonly joinedAt: Date;
}

export interface ClubWithMembers extends Club {
  readonly members: readonly ClubMember[];
}

/** A club and its roster are visible to its members and to system admins only. */
export const canViewClub = (actor: Actor, clubId: string): boolean => isSystemAdmin(actor) || isSameClub(actor, clubId);

/** Club admins manage their own club; system admins manage every club. */
export const canManageClub = (actor: Actor, clubId: string): boolean =>
  isSystemAdmin(actor) || (actor.roles.includes("CLUB_ADMIN") && isSameClub(actor, clubId));
