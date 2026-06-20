import type { IClubRepo } from "@/domain/repositories/IClubRepo";
import type { Club } from "@/domain/entities/Club";
import { ImageProcessor } from "@/application/utils/ImageProcessor";

export class ClubService {
  constructor(private readonly clubRepo: IClubRepo) {}

  async createClub(data: {
    name: string;
    location?: string;
    profilePicture?: File;
    banner?: File;
  }): Promise<Club> {
    const profilePicBase64 = await ImageProcessor.processToWebPBase64(
      data.profilePicture,
    );
    const bannerBase64 = await ImageProcessor.processToWebPBase64(data.banner);

    return this.clubRepo.create({
      name: data.name,
      location: data.location,
      ...(profilePicBase64 && { profilePicture: profilePicBase64 }),
      ...(bannerBase64 && { banner: bannerBase64 }),
    });
  }

  async updateClub(
    clubId: string,
    data: {
      name?: string;
      location?: string;
      profilePicture?: File;
      banner?: File;
    },
  ): Promise<Club> {
    const profilePicBase64 = await ImageProcessor.processToWebPBase64(
      data.profilePicture,
    );
    const bannerBase64 = await ImageProcessor.processToWebPBase64(data.banner);

    return this.clubRepo.update(clubId, {
      name: data.name,
      location: data.location,
      ...(profilePicBase64 && { profilePicture: profilePicBase64 }),
      ...(bannerBase64 && { banner: bannerBase64 }),
    });
  }

  async getClub(clubId: string): Promise<Club> {
    const club = await this.clubRepo.findById(clubId);
    if (!club) throw new Error("Club not found");
    return club;
  }

  async getAllClubs(): Promise<Club[]> {
    return this.clubRepo.findAll();
  }

  async deleteClub(clubId: string): Promise<void> {
    await this.clubRepo.delete(clubId);
  }
}
