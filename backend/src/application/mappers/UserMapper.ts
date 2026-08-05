import type { User } from "@/domain/entities/User";
import type { UserView } from "@/application/views/user.view";

export class UserMapper {
  static toDomain(record: any): User {
    return {
      id: record.id,
      email: record.email,
      phone: record.phone,
      passwordHash: record.passwordHash,
      roles: record.roles,
      eloSingles: record.eloSingles ?? record.elo ?? 200,
      eloDoubles: record.eloDoubles ?? record.elo ?? 200,
      isActive: record.isActive,
      lastAccess: record.lastAccess,
      clubId: record.clubId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      profile: record.profile ?? null,
    };
  }

  static toView(userOrRecord: any): UserView {
    return {
      id: userOrRecord.id,
      email: userOrRecord.email,
      phone: userOrRecord.phone,
      roles: userOrRecord.roles,
      clubId: userOrRecord.clubId,
      profile: userOrRecord.profile
        ? { name: userOrRecord.profile.name, photo: userOrRecord.profile.photo ?? null }
        : null,
    };
  }
}
