import type { ProfileChanges, ProfileImageKind, ProfileRepository } from "@bb/application";
import { DEFAULT_RATING, isObjectId, type PlayerProfile, type Role } from "@bb/domain";
import type { Database } from "@/shared/database";

const IMAGE_FIELDS = {
  photo: { data: "photo", version: "photoVersion" },
  banner: { data: "banner", version: "bannerVersion" },
} as const;

export class PrismaProfileRepository implements ProfileRepository {
  constructor(private readonly db: Database) {}

  async findPlayer(userId: string): Promise<PlayerProfile | null> {
    if (!isObjectId(userId)) return null;
    const row = await this.db.profile.findUnique({
      where: { userId },
      select: {
        userId: true,
        name: true,
        birthday: true,
        sex: true,
        bio: true,
        photoVersion: true,
        bannerVersion: true,
        updatedAt: true,
        user: {
          select: { email: true, phone: true, roles: true, clubId: true, eloSingles: true, eloDoubles: true, createdAt: true },
        },
      },
    });
    if (!row) return null;
    return {
      userId: row.userId,
      name: row.name,
      birthday: row.birthday,
      sex: row.sex,
      bio: row.bio,
      photoVersion: row.photoVersion,
      bannerVersion: row.bannerVersion,
      updatedAt: row.updatedAt,
      email: row.user.email,
      phone: row.user.phone,
      roles: row.user.roles as Role[],
      clubId: row.user.clubId,
      eloSingles: row.user.eloSingles ?? DEFAULT_RATING,
      eloDoubles: row.user.eloDoubles ?? DEFAULT_RATING,
      memberSince: row.user.createdAt,
    };
  }

  async update(userId: string, changes: ProfileChanges): Promise<void> {
    await this.db.profile.update({ where: { userId }, data: changes });
  }

  async setImage(userId: string, kind: ProfileImageKind, image: { dataUrl: string; version: string } | null): Promise<void> {
    const fields = IMAGE_FIELDS[kind];
    await this.db.profile.update({
      where: { userId },
      data: { [fields.data]: image?.dataUrl ?? null, [fields.version]: image?.version ?? null },
    });
  }

  async getImage(userId: string, kind: ProfileImageKind): Promise<string | null> {
    const row = await this.db.profile.findUnique({ where: { userId }, select: { photo: true, banner: true } });
    return (kind === "photo" ? row?.photo : row?.banner) ?? null;
  }
}
