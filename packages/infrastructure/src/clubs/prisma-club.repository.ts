import type { ClubImageKind, ClubRepository } from "@bb/application";
import { type Club, type ClubWithMembers, DEFAULT_RATING, isObjectId, type Role } from "@bb/domain";
import type { Prisma } from "@prisma/client";
import type { Database } from "@/shared/database";

/** Never selects the image columns: they can be large and are served by the media route instead. */
const clubColumns = {
  id: true,
  name: true,
  location: true,
  pictureVersion: true,
  bannerVersion: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClubSelect;

type ClubRow = Prisma.ClubGetPayload<{ select: typeof clubColumns }>;

const toClub = (row: ClubRow): Club => ({
  id: row.id,
  name: row.name,
  location: row.location,
  pictureVersion: row.pictureVersion,
  bannerVersion: row.bannerVersion,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const IMAGE_FIELDS = {
  picture: { data: "profilePicture", version: "pictureVersion" },
  banner: { data: "banner", version: "bannerVersion" },
} as const;

export class PrismaClubRepository implements ClubRepository {
  constructor(private readonly db: Database) {}

  async create(input: { name: string; location: string | null }): Promise<Club> {
    return toClub(await this.db.club.create({ data: input, select: clubColumns }));
  }

  async update(id: string, input: { name?: string; location?: string | null }): Promise<Club> {
    return toClub(await this.db.club.update({ where: { id }, data: input, select: clubColumns }));
  }

  async findById(id: string): Promise<Club | null> {
    if (!isObjectId(id)) return null;
    const row = await this.db.club.findUnique({ where: { id }, select: clubColumns });
    return row ? toClub(row) : null;
  }

  async findWithMembers(id: string): Promise<ClubWithMembers | null> {
    if (!isObjectId(id)) return null;
    const row = await this.db.club.findUnique({
      where: { id },
      select: {
        ...clubColumns,
        users: {
          select: {
            id: true,
            email: true,
            roles: true,
            eloSingles: true,
            eloDoubles: true,
            createdAt: true,
            profile: { select: { name: true, photoVersion: true } },
          },
        },
      },
    });
    if (!row) return null;
    return {
      ...toClub(row),
      members: row.users.map((u) => ({
        id: u.id,
        email: u.email,
        roles: u.roles as Role[],
        name: u.profile?.name || null,
        photoVersion: u.profile?.photoVersion ?? null,
        eloSingles: u.eloSingles ?? DEFAULT_RATING,
        eloDoubles: u.eloDoubles ?? DEFAULT_RATING,
        joinedAt: u.createdAt,
      })),
    };
  }

  async listAll(): Promise<Club[]> {
    const rows = await this.db.club.findMany({ select: clubColumns, orderBy: { name: "asc" } });
    return rows.map(toClub);
  }

  async delete(id: string): Promise<void> {
    await this.db.club.delete({ where: { id } });
  }

  async setImage(id: string, kind: ClubImageKind, image: { dataUrl: string; version: string } | null): Promise<void> {
    const fields = IMAGE_FIELDS[kind];
    await this.db.club.update({
      where: { id },
      data: { [fields.data]: image?.dataUrl ?? null, [fields.version]: image?.version ?? null },
    });
  }

  async getImage(id: string, kind: ClubImageKind): Promise<string | null> {
    const row = await this.db.club.findUnique({ where: { id }, select: { profilePicture: true, banner: true } });
    return (kind === "picture" ? row?.profilePicture : row?.banner) ?? null;
  }

  countGames(id: string): Promise<number> {
    return this.db.game.count({ where: { clubId: id } });
  }
}
