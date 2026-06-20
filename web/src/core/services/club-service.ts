import type { ClubService } from "@/core/services/interfaces/club-service";
import type { ClubRepo } from "@/core/repositories/interfaces/club-repo";
import type { Club } from "@/core/domain/club";

export class ClubServiceImpl implements ClubService {
  private readonly clubRepo: ClubRepo;

  constructor(clubRepo: ClubRepo) {
    this.clubRepo = clubRepo;
  }

  async getClubById(clubId: string): Promise<Club> {
    return this.clubRepo.getById(clubId);
  }

  async getAllClubs(): Promise<Club[]> {
    return this.clubRepo.getAll();
  }

  async createClub(data: { name: string; location?: string }): Promise<Club> {
    return this.clubRepo.create(data);
  }

  async updateClub(id: string, data: { name?: string; location?: string }): Promise<Club> {
    return this.clubRepo.update(id, data);
  }

  async assignUserToClub(userId: string, clubId: string): Promise<Club> {
    return this.clubRepo.assignUser(userId, clubId);
  }

  async deleteClub(id: string): Promise<void> {
    return this.clubRepo.delete(id);
  }
}
