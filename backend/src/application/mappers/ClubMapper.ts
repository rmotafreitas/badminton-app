import type { Club } from "@/domain/entities/Club";
import type { ClubView } from "@/application/views/club.view";
import { normalizeImageUrl } from "@/application/utils/normalizeImageUrl";

export class ClubMapper {
  static toDomain(record: any): Club {
    return {
      id: record.id,
      name: record.name,
      location: record.location,
      profilePicture: record.profilePicture,
      banner: record.banner,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      users: record.users,
    };
  }

  static toView(club: Club): ClubView {
    return {
      id: club.id,
      name: club.name,
      location: club.location,
      profilePicture: normalizeImageUrl(club.profilePicture),
      banner: normalizeImageUrl(club.banner),
      createdAt: club.createdAt,
      updatedAt: club.updatedAt,
      users: club.users?.map((u) => ({
        ...u,
        profile: u.profile
          ? { ...u.profile, photo: normalizeImageUrl(u.profile.photo) }
          : null,
      })),
    };
  }
}
