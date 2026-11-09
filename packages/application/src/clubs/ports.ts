import type { Club, ClubWithMembers } from "@bb/domain";
import type { ProcessedImage } from "@/shared";

export type ClubImageKind = "picture" | "banner";

export interface ClubRepository {
  create(input: { name: string; location: string | null }): Promise<Club>;
  update(id: string, input: { name?: string; location?: string | null }): Promise<Club>;
  findById(id: string): Promise<Club | null>;
  findWithMembers(id: string): Promise<ClubWithMembers | null>;
  listAll(): Promise<Club[]>;
  delete(id: string): Promise<void>;
  /** `null` removes the image. */
  setImage(id: string, kind: ClubImageKind, image: ProcessedImage | null): Promise<void>;
  getImage(id: string, kind: ClubImageKind): Promise<string | null>;
  countGames(id: string): Promise<number>;
}
