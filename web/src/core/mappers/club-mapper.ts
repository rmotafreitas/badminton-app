import type { Club } from "@/core/domain/club";
import type { ClubView } from "@/core/views/club.view";
import { safeImageUrl } from "@/lib/image-utils";

export class ClubMapper {
  static toDomain(view: ClubView): Club {
    return {
      id: view.id,
      name: view.name,
      location: view.location,
      profilePicture: safeImageUrl(view.profilePicture),
      banner: safeImageUrl(view.banner),
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
      users: view.users?.map((u) => ({
        ...u,
        profile: u.profile
          ? { ...u.profile, photo: safeImageUrl(u.profile.photo) }
          : null,
      })),
    };
  }
}
