import { PrismaClient } from "@prisma/client";
import type {
  CreateRallySessionParams,
  IRallySessionRepo,
  RallySessionPatch,
} from "@/domain/repositories/IRallySessionRepo";
import type { RallySession } from "@/domain/entities/RallySession";
import { RallySessionMapper } from "@/application/mappers/RallySessionMapper";

export class PrismaRallySessionRepo implements IRallySessionRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateRallySessionParams): Promise<RallySession> {
    const r = await this.prisma.rallySession.create({
      data: {
        ownerId: data.ownerId,
        clientId: data.clientId,
        title: data.title ?? null,
        recordedAt: data.recordedAt,
        durationS: data.durationS,
        gameId: data.gameId ?? null,
        trainingDate: data.trainingDate ?? null,
        participants: [],
        participantUserIds: [],
      },
    });
    return RallySessionMapper.toDomain(r);
  }

  async findById(id: string): Promise<RallySession | null> {
    if (!/^[a-f0-9]{24}$/i.test(id)) return null;
    const r = await this.prisma.rallySession.findUnique({ where: { id } });
    return r ? RallySessionMapper.toDomain(r) : null;
  }

  async findByClientId(ownerId: string, clientId: string): Promise<RallySession | null> {
    const r = await this.prisma.rallySession.findUnique({
      where: { ownerId_clientId: { ownerId, clientId } },
    });
    return r ? RallySessionMapper.toDomain(r) : null;
  }

  async findForUser(userId: string): Promise<RallySession[]> {
    const rs = await this.prisma.rallySession.findMany({
      where: { OR: [{ ownerId: userId }, { participantUserIds: { has: userId } }] },
      orderBy: { recordedAt: "desc" },
    });
    return rs.map(RallySessionMapper.toDomain);
  }

  async findWithParticipant(userId: string): Promise<RallySession[]> {
    const rs = await this.prisma.rallySession.findMany({
      where: { participantUserIds: { has: userId } },
      orderBy: { recordedAt: "desc" },
    });
    return rs.map(RallySessionMapper.toDomain);
  }

  async findByGameId(gameId: string): Promise<RallySession[]> {
    if (!/^[a-f0-9]{24}$/i.test(gameId)) return [];
    const rs = await this.prisma.rallySession.findMany({ where: { gameId }, orderBy: { recordedAt: "desc" } });
    return rs.map(RallySessionMapper.toDomain);
  }

  async findExpiredVideos(now: Date): Promise<RallySession[]> {
    const rs = await this.prisma.rallySession.findMany({
      where: { pinned: false, videoKey: { not: null }, videoExpiresAt: { lt: now } },
    });
    return rs.map(RallySessionMapper.toDomain);
  }

  async update(id: string, patch: RallySessionPatch): Promise<RallySession> {
    const data: any = { ...patch };
    if (patch.participants) data.participantUserIds = [...new Set(patch.participants.map((p) => p.userId))];
    if (patch.summary !== undefined) data.summary = patch.summary ?? undefined;
    if (patch.corrections !== undefined) data.corrections = patch.corrections ?? undefined;
    const r = await this.prisma.rallySession.update({ where: { id }, data });
    return RallySessionMapper.toDomain(r);
  }

  async acquireLock(id: string, deviceId: string, until: Date, now: Date): Promise<RallySession | null> {
    // Conditional update = atomic compare-and-set on the lock.
    const res = await this.prisma.rallySession.updateMany({
      where: {
        id,
        OR: [
          { analysisLock: { is: null } },
          { analysisLock: { isSet: false } },
          { analysisLock: { is: { until: { lt: now } } } },
          { analysisLock: { is: { deviceId } } },
        ],
      },
      data: { analysisLock: { set: { deviceId, until } } },
    });
    return res.count === 1 ? this.findById(id) : null;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.rallySession.delete({ where: { id } });
  }
}
