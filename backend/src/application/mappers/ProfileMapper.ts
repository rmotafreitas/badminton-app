import type { Profile } from "@/domain/entities/Profile";
import type { ProfileView } from "@/application/views/profile.view";
import { normalizeImageUrl } from "@/application/utils/normalizeImageUrl";

export class ProfileMapper {
  static toDomain(record: any): Profile {
    return {
      id: record.id,
      userId: record.userId,
      name: record.name,
      birthday: record.birthday,
      sex: record.sex,
      photo: record.photo,
      banner: record.banner,
      bio: record.bio,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  static toView(profile: Profile): ProfileView {
    return {
      id: profile.id,
      userId: profile.userId,
      name: profile.name,
      birthday: profile.birthday,
      sex: profile.sex,
      photo: normalizeImageUrl(profile.photo),
      banner: normalizeImageUrl(profile.banner),
      bio: profile.bio,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
