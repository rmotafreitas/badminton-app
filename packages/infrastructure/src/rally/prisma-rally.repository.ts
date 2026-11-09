import type { NewRallySession, RallySessionPatch, RallySessionRepository } from "@bb/application";
import { isObjectId, type RallyFormat, type RallySession, type RallySessionStatus } from "@bb/domain";
import type { Prisma, RallySession as RallyRow } from "@prisma/client";
import type { Database } from "@/shared/database";

const toSession = (r: RallyRow): RallySession => ({
  id: r.id,
  ownerId: r.ownerId,
  clientId: r.clientId,
  title: r.title ?? null,
  recordedAt: r.recordedAt,
  durationS: r.durationS,
  status: r.status as RallySessionStatus,
  format: (r.format as RallyFormat | null) ?? null,
  gameId: r.gameId ?? null,
  trainingDate: r.trainingDate ?? null,
  participants: r.participants.map((p) => ({ playerId: p.playerId, userId: p.userId })),
  videoKey: r.videoKey ?? null,
  videoBytes: r.videoBytes ?? null,
  videoUploadedAt: r.videoUploadedAt ?? null,
  videoExpiresAt: r.videoExpiresAt ?? null,
  pinned: r.pinned,
  resultKey: r.resultKey ?? null,
  summary: r.summary ?? null,
  corrections: r.corrections ?? null,
  analysisLock: r.analysisLock ? { deviceId: r.analysisLock.deviceId, until: r.analysisLock.until } : null,
  shareForTraining: r.shareForTraining,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const json = (value: unknown) => (value === null || value === undefined ? undefined : (value as Prisma.InputJsonValue));

export class PrismaRallySessionRepository implements RallySessionRepository {
  constructor(private readonly db: Database) {}

  async create(input: NewRallySession): Promise<RallySession> {
    const row = await this.db.rallySession.create({ data: { ...input, participants: [], participantUserIds: [] } });
    return toSession(row);
  }

  async findById(id: string): Promise<RallySession | null> {
    if (!isObjectId(id)) return null;
    const row = await this.db.rallySession.findUnique({ where: { id } });
    return row ? toSession(row) : null;
  }

  async findByClientId(ownerId: string, clientId: string): Promise<RallySession | null> {
    const row = await this.db.rallySession.findUnique({ where: { ownerId_clientId: { ownerId, clientId } } });
    return row ? toSession(row) : null;
  }

  async findForUser(userId: string): Promise<RallySession[]> {
    const rows = await this.db.rallySession.findMany({
      where: { OR: [{ ownerId: userId }, { participantUserIds: { has: userId } }] },
      orderBy: { recordedAt: "desc" },
    });
    return rows.map(toSession);
  }

  async findWithParticipant(userId: string): Promise<RallySession[]> {
    const rows = await this.db.rallySession.findMany({
      where: { participantUserIds: { has: userId } },
      orderBy: { recordedAt: "desc" },
    });
    return rows.map(toSession);
  }

  async findByGameId(gameId: string): Promise<RallySession[]> {
    if (!isObjectId(gameId)) return [];
    const rows = await this.db.rallySession.findMany({ where: { gameId }, orderBy: { recordedAt: "desc" } });
    return rows.map(toSession);
  }

  async findExpiredVideos(now: Date): Promise<RallySession[]> {
    const rows = await this.db.rallySession.findMany({
      where: { pinned: false, videoKey: { not: null }, videoExpiresAt: { lt: now } },
    });
    return rows.map(toSession);
  }

  async update(id: string, patch: RallySessionPatch): Promise<RallySession> {
    const { participants, summary, corrections, analysisLock, ...rest } = patch;
    const data: Prisma.RallySessionUpdateInput = { ...rest };
    if (participants) {
      data.participants = participants.map((p) => ({ ...p }));
      data.participantUserIds = [...new Set(participants.map((p) => p.userId))];
    }
    if (summary !== undefined) data.summary = json(summary);
    if (corrections !== undefined) data.corrections = json(corrections);
    if (analysisLock !== undefined) data.analysisLock = analysisLock ? { set: { ...analysisLock } } : { unset: true };
    return toSession(await this.db.rallySession.update({ where: { id }, data }));
  }

  /** Conditional update = atomic compare-and-set on the lock. */
  async acquireLock(id: string, deviceId: string, until: Date, now: Date): Promise<RallySession | null> {
    const { count } = await this.db.rallySession.updateMany({
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
    return count === 1 ? this.findById(id) : null;
  }

  async delete(id: string): Promise<void> {
    await this.db.rallySession.delete({ where: { id } });
  }
}
