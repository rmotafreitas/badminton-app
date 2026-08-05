import { ProfileService } from "@/application/services/ProfileService";
import type { UpdateProfileDto } from "@/application/dtos/profile.dto";
import type { ProfileView } from "@/application/views/profile.view";
import { ProfileMapper } from "@/application/mappers/ProfileMapper";

export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  async getMyProfile(userId: string): Promise<ProfileView> {
    const { profile, user } = await this.profileService.getProfileWithUser(userId);
    return ProfileMapper.toView(profile, user);
  }

  async updateMyProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileView> {
    await this.profileService.updateProfile(userId, dto);
    const { profile, user } = await this.profileService.getProfileWithUser(userId);
    return ProfileMapper.toView(profile, user);
  }

  async getProfile(targetUserId: string): Promise<ProfileView> {
    const { profile, user } = await this.profileService.getProfileWithUser(targetUserId);
    return ProfileMapper.toView(profile, user);
  }
}
