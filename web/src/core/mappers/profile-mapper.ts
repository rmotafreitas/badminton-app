import type { Profile } from "@/core/domain/profile";
import type { ProfileView } from "@/core/views/profile.view";
import { safeImageUrl } from "@/lib/image-utils";
import { fallbackAvatar } from "@/lib/avatar-utils";

export class ProfileMapper {
  static toDomain(view: ProfileView): Profile {
    const photo = safeImageUrl(view.photo);
    return {
      id: view.id,
      userId: view.userId,
      name: view.name,
      birthday: view.birthday,
      sex: view.sex,
      photo: photo ?? fallbackAvatar(view.name, null, view.userId),
      banner: safeImageUrl(view.banner),
      bio: view.bio,
      email: view.email ?? null,
      phone: view.phone ?? null,
      roles: view.roles ?? [],
      eloSingles: view.eloSingles ?? 200,
      eloDoubles: view.eloDoubles ?? 200,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
    };
  }
}
