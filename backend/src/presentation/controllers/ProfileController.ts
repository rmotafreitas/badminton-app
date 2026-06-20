import { ProfileService } from "@/application/services/ProfileService";
import type { UpdateProfileDto } from "@/application/dtos/profile.dto";
import type { ProfileView } from "@/application/views/profile.view";
import { ProfileMapper } from "@/application/mappers/ProfileMapper";

export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  async getMyProfile(userId: string): Promise<ProfileView> {
    const profile = await this.profileService.getProfileByUserId(userId);
    return ProfileMapper.toView(profile);
  }

  async updateMyProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileView> {
    const profile = await this.profileService.updateProfile(userId, dto);
    return ProfileMapper.toView(profile);
  }

  async getProfile(targetUserId: string): Promise<ProfileView> {
    const profile = await this.profileService.getProfileByUserId(targetUserId);
    return ProfileMapper.toView(profile);
  }
}
