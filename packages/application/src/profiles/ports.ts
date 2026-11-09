import type { PlayerProfile } from "@bb/domain";

export type ProfileImageKind = "photo" | "banner";

export interface ProfileChanges {
  readonly name?: string;
  readonly birthday?: Date | null;
  readonly sex?: string | null;
  readonly bio?: string | null;
}

export interface ProfileRepository {
  /** The profile joined with the account facts the profile page shows. */
  findPlayer(userId: string): Promise<PlayerProfile | null>;
  update(userId: string, changes: ProfileChanges): Promise<void>;
  setImage(userId: string, kind: ProfileImageKind, image: { dataUrl: string; version: string } | null): Promise<void>;
  getImage(userId: string, kind: ProfileImageKind): Promise<string | null>;
}
