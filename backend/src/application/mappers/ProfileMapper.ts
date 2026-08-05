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

  static toView(
    profile: Profile,
    user?: { email: string | null; phone: string | null; roles: string[]; eloSingles: number; eloDoubles: number } | null,
  ): ProfileView {
    return {
      id: profile.id,
      userId: profile.userId,
      name: profile.name,
      email: user?.email ?? null,
      phone: user?.phone ?? null,
      roles: user?.roles ?? [],
      birthday: profile.birthday,
      sex: profile.sex,
      photo: normalizeImageUrl(profile.photo),
      banner: normalizeImageUrl(profile.banner),
      bio: profile.bio,
      eloSingles: user?.eloSingles ?? 200,
      eloDoubles: user?.eloDoubles ?? 200,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
