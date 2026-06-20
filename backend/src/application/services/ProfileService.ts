import type { IProfileRepo } from "@/domain/repositories/IProfileRepo";
import type { Profile } from "@/domain/entities/Profile";
import { ImageProcessor } from "@/application/utils/ImageProcessor";

export class ProfileService {
  constructor(private readonly profileRepo: IProfileRepo) {}

  async getProfileByUserId(userId: string): Promise<Profile> {
    const profile = await this.profileRepo.findByUserId(userId);
    if (!profile) throw new Error("Profile not found");
    return profile;
  }

  async updateProfile(
    userId: string,
    data: {
      name?: string;
      birthday?: string;
      sex?: string;
      photo?: File;
      banner?: File;
      bio?: string;
    },
  ): Promise<Profile> {
    const updateData: any = {
      name: data.name,
      birthday: data.birthday ? new Date(data.birthday) : undefined,
      sex: data.sex,
      bio: data.bio,
    };

    if (data.photo !== undefined) {
      updateData.photo =
        data.photo.size > 0
          ? await ImageProcessor.processToWebPBase64(data.photo, {
              maxWidth: 512,
              maxHeight: 512,
              quality: 70,
            })
          : null;
    }

    if (data.banner !== undefined) {
      updateData.banner =
        data.banner.size > 0
          ? await ImageProcessor.processToWebPBase64(data.banner, {
              maxWidth: 1600,
              maxHeight: 534,
              quality: 60,
            })
          : null;
    }

    return this.profileRepo.updateByUserId(userId, updateData);
  }
}
