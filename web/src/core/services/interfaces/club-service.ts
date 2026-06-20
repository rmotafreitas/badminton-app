import type { Club } from "@/core/domain/club";

export interface ClubService {
  getClubById(clubId: string): Promise<Club>;
  getAllClubs(): Promise<Club[]>;
  createClub(data: { name: string; location?: string }): Promise<Club>;
  updateClub(id: string, data: { name?: string; location?: string }): Promise<Club>;
  assignUserToClub(userId: string, clubId: string): Promise<Club>;
  deleteClub(id: string): Promise<void>;
}
