import type { GameChanges, GameRepository, NewGame, PlayerDirectory } from "@bb/application";
import { type Game, type GamePlayer, type GameType, isObjectId } from "@bb/domain";
import type { Game as GameRow } from "@prisma/client";
import type { Database } from "@/shared/database";

const toGame = (row: GameRow): Game => ({
  id: row.id,
  type: row.type as GameType,
  clubId: row.clubId,
  team1PlayerIds: row.team1PlayerIds,
  team2PlayerIds: row.team2PlayerIds,
  sets: row.sets.map((s) => ({ team1Score: s.team1Score, team2Score: s.team2Score })),
  registeredById: row.registeredById,
  playedAt: row.playedAt,
  createdAt: row.createdAt,
});

const involving = (userId: string) => ({ OR: [{ team1PlayerIds: { has: userId } }, { team2PlayerIds: { has: userId } }] });
const newestFirst = [{ playedAt: "desc" as const }, { createdAt: "desc" as const }];

export class PrismaGameRepository implements GameRepository {
  constructor(private readonly db: Database) {}

  async create(input: NewGame): Promise<Game> {
    const row = await this.db.game.create({
      data: {
        ...input,
        team1PlayerIds: [...input.team1PlayerIds],
        team2PlayerIds: [...input.team2PlayerIds],
        sets: input.sets.map((s) => ({ ...s })),
      },
    });
    return toGame(row);
  }

  async findById(id: string): Promise<Game | null> {
    if (!isObjectId(id)) return null;
    const row = await this.db.game.findUnique({ where: { id } });
    return row ? toGame(row) : null;
  }

  async update(id: string, changes: GameChanges): Promise<Game> {
    const row = await this.db.game.update({
      where: { id },
      data: {
        ...(changes.type && { type: changes.type }),
        ...(changes.team1PlayerIds && { team1PlayerIds: [...changes.team1PlayerIds] }),
        ...(changes.team2PlayerIds && { team2PlayerIds: [...changes.team2PlayerIds] }),
        ...(changes.sets && { sets: changes.sets.map((s) => ({ ...s })) }),
        ...(changes.playedAt && { playedAt: changes.playedAt }),
      },
    });
    return toGame(row);
  }

  async delete(id: string): Promise<void> {
    await this.db.game.delete({ where: { id } });
  }

  async listByClub(clubId: string, limit: number): Promise<Game[]> {
    const rows = await this.db.game.findMany({ where: { clubId }, orderBy: newestFirst, take: limit });
    return rows.map(toGame);
  }

  async listAllByClub(clubId: string): Promise<Game[]> {
    const rows = await this.db.game.findMany({ where: { clubId }, orderBy: { playedAt: "asc" } });
    return rows.map(toGame);
  }

  async listByPlayer(userId: string): Promise<Game[]> {
    const rows = await this.db.game.findMany({ where: involving(userId), orderBy: newestFirst });
    return rows.map(toGame);
  }

  async countForUser(userId: string): Promise<number> {
    if (!isObjectId(userId)) return 0;
    return this.db.game.count({ where: { OR: [involving(userId), { registeredById: userId }] } });
  }

  async listShared(userA: string, userB: string): Promise<Game[]> {
    const rows = await this.db.game.findMany({ where: { AND: [involving(userA), involving(userB)] }, orderBy: newestFirst });
    return rows.map(toGame);
  }
}

/** One query for every player on a page of games. */
export class PrismaPlayerDirectory implements PlayerDirectory {
  constructor(private readonly db: Database) {}

  async findPlayers(ids: readonly string[]): Promise<GamePlayer[]> {
    const valid = ids.filter(isObjectId);
    if (valid.length === 0) return [];
    const rows = await this.db.user.findMany({
      where: { id: { in: valid } },
      select: { id: true, email: true, profile: { select: { name: true, photoVersion: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.profile?.name || null,
      photoVersion: r.profile?.photoVersion ?? null,
    }));
  }
}
