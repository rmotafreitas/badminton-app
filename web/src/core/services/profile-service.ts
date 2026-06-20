import type { ProfileService } from "./interfaces/profile-service";
import type { ProfileRepo } from "@/core/repositories/interfaces/profile-repo";
import type { Profile } from "@/core/domain/profile";

export class ProfileServiceImpl implements ProfileService {
  private readonly profileRepo: ProfileRepo;

  constructor(profileRepo: ProfileRepo) {
    this.profileRepo = profileRepo;
  }

  async getMyProfile(): Promise<Profile> {
    return this.profileRepo.getMyProfile();
  }

  async updateMyProfile(data: {
    name?: string;
    birthday?: string;
    sex?: string;
    bio?: string;
    photo?: File | null;
    banner?: File | null;
  }): Promise<Profile> {
    return this.profileRepo.updateMyProfile(data);
  }
}
