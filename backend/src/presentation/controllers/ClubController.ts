import { ClubService } from "@/application/services/ClubService";
import type { CreateClubDto, UpdateClubDto, AssignClubDto } from "@/application/dtos/club.dto";
import type { ClubView } from "@/application/views/club.view";
import { ClubMapper } from "@/application/mappers/ClubMapper";

export class ClubController {
  constructor(
    private readonly clubService: ClubService,
    private readonly userRepo: any,
  ) {}

  async createClub(dto: CreateClubDto): Promise<ClubView> {
    const club = await this.clubService.createClub(dto);
    return ClubMapper.toView(club);
  }

  async updateClub(clubId: string, dto: UpdateClubDto): Promise<ClubView> {
    const club = await this.clubService.updateClub(clubId, dto);
    return ClubMapper.toView(club);
  }

  async getClub(clubId: string): Promise<ClubView> {
    const club = await this.clubService.getClub(clubId);
    return ClubMapper.toView(club);
  }

  async getAllClubs(): Promise<ClubView[]> {
    const clubs = await this.clubService.getAllClubs();
    return clubs.map(ClubMapper.toView);
  }

  async assignUserToClub(dto: AssignClubDto): Promise<ClubView> {
    await this.userRepo.assignClub(dto.userId, dto.clubId);
    return this.getClub(dto.clubId);
  }

  async deleteClub(clubId: string): Promise<{ success: boolean }> {
    await this.clubService.deleteClub(clubId);
    return { success: true };
  }
}
