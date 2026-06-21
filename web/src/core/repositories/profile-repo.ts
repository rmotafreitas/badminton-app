import type { ProfileRepo } from "./interfaces/profile-repo";
import type { Profile } from "@/core/domain/profile";
import type { ProfileView } from "@/core/views/profile.view";
import { ProfileMapper } from "@/core/mappers/profile-mapper";
import api from "@/lib/api";

export class ProfileRepoImpl implements ProfileRepo {
  async getMyProfile(): Promise<Profile> {
    const { data } = await api.get<ProfileView>("/profile/me");
    return ProfileMapper.toDomain(data);
  }

  async getProfile(userId: string): Promise<Profile> {
    const { data } = await api.get<ProfileView>(`/profile/${userId}`);
    return ProfileMapper.toDomain(data);
  }

  async updateMyProfile(dto: {
    name?: string;
    birthday?: string;
    sex?: string;
    bio?: string;
    photo?: File | null;
    banner?: File | null;
  }): Promise<Profile> {
    const formData = new FormData();
    if (dto.name) formData.append("name", dto.name);
    if (dto.birthday) formData.append("birthday", dto.birthday);
    if (dto.sex) formData.append("sex", dto.sex);
    if (dto.bio) formData.append("bio", dto.bio);

    if (dto.photo) {
      formData.append("photo", dto.photo);
    } else if (dto.photo === null) {
      formData.append(
        "photo",
        new File([], "empty.webp", { type: "image/webp" }),
      );
    }

    if (dto.banner) {
      formData.append("banner", dto.banner);
    } else if (dto.banner === null) {
      formData.append(
        "banner",
        new File([], "empty.webp", { type: "image/webp" }),
      );
    }

    const { data } = await api.put<ProfileView>("/profile/me", formData);
    return ProfileMapper.toDomain(data);
  }
}
