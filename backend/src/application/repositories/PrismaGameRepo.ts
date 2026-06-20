import { PrismaClient } from "@prisma/client";
import type {
  IGameRepo,
  CreateGameParams,
} from "@/domain/repositories/IGameRepo";
import type { Game } from "@/domain/entities/Game";
import { GameMapper } from "@/application/mappers/GameMapper";

export class PrismaGameRepo implements IGameRepo {
  constructor(private readonly prisma: PrismaClient) {}

  private async populatePlayers(record: any): Promise<Game> {
    const allIds = [...(record.team1PlayerIds || []), ...(record.team2PlayerIds || [])];
    if (allIds.length === 0) return GameMapper.toDomain(record);

    const users = await this.prisma.user.findMany({
      where: { id: { in: allIds } },
      select: { id: true, email: true, profile: { select: { name: true, photo: true } } },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return GameMapper.toDomain({
      ...record,
      team1Players: (record.team1PlayerIds || []).map((id: string) => userMap.get(id) || { id, email: null, profile: null }),
      team2Players: (record.team2PlayerIds || []).map((id: string) => userMap.get(id) || { id, email: null, profile: null }),
    });
  }

  async create(data: CreateGameParams): Promise<Game> {
    const record = await this.prisma.game.create({
      data: {
        type: data.type,
        clubId: data.clubId,
        team1PlayerIds: data.team1PlayerIds,
        team2PlayerIds: data.team2PlayerIds,
        sets: data.sets,
        registeredById: data.registeredById,
        playedAt: data.playedAt ?? new Date(),
      },
    });
    return this.populatePlayers(record);
  }

  async findRecentByClub(clubId: string): Promise<Game[]> {
    const records = await this.prisma.game.findMany({
      where: { clubId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return Promise.all(records.map((r) => this.populatePlayers(r)));
  }

  async findByPlayerId(playerId: string): Promise<Game[]> {
    const records = await this.prisma.game.findMany({
      where: {
        OR: [
          { team1PlayerIds: { has: playerId } },
          { team2PlayerIds: { has: playerId } },
        ],
      },
      orderBy: { playedAt: "desc" },
    });
    return Promise.all(records.map((r) => this.populatePlayers(r)));
  }

  async findById(id: string): Promise<Game | null> {
    const record = await this.prisma.game.findUnique({ where: { id } });
    if (!record) return null;
    return this.populatePlayers(record);
  }

  async update(id: string, data: Partial<CreateGameParams>): Promise<Game> {
    const record = await this.prisma.game.update({
      where: { id },
      data: {
        ...(data.type && { type: data.type }),
        ...(data.team1PlayerIds && { team1PlayerIds: data.team1PlayerIds }),
        ...(data.team2PlayerIds && { team2PlayerIds: data.team2PlayerIds }),
        ...(data.sets && { sets: data.sets }),
        ...(data.playedAt && { playedAt: data.playedAt }),
      },
    });
    return this.populatePlayers(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.game.delete({ where: { id } });
  }
}
