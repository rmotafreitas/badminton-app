import type { RallyFormat, RallyParticipant, RallySession } from "@/domain/entities/RallySession";
import type { IRallySessionRepo, RallySessionPatch } from "@/domain/repositories/IRallySessionRepo";
import type { IUserRepo } from "@/domain/repositories/IUserRepo";
import type { IObjectStorage } from "@/application/interfaces/IObjectStorage";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  QuotaError,
  ValidationError,
} from "@/application/errors/AppError";

export const RALLY_LIMITS = {
  /** Review videos are deleted this long after upload unless pinned. */
  videoRetentionDays: 60,
  /** Soft cap per user; uploads beyond 120 % are refused. */
  quotaBytes: 1024 ** 3,
  maxPins: 5,
  /** Single review copy: 720p60 at ~2 Mbit/s is ~15 MB/min. */
  maxVideoBytes: 2 * 1024 ** 3,
  lockMinutes: 10,
} as const;

export type Access = "full" | "summary" | "none";

export interface UpdateRallySessionInput {
  title?: string | null;
  format?: RallyFormat | null;
  gameId?: string | null;
  trainingDate?: string | null;
  participants?: RallyParticipant[];
  pinned?: boolean;
  corrections?: unknown;
  shareForTraining?: boolean;
}

const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export class RallySessionService {
  constructor(
    private readonly repo: IRallySessionRepo,
    private readonly users: IUserRepo,
    private readonly storage: IObjectStorage,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  // ── Access ────────────────────────────────────────────────────────────────

  /** Owner + linked players see everything; club-mates see the summary. */
  async accessFor(session: RallySession, userId: string): Promise<Access> {
    if (session.ownerId === userId) return "full";
    if (session.participants.some((p) => p.userId === userId)) return "full";
    const [viewer, owner] = await Promise.all([
      this.users.findById(userId),
      this.users.findById(session.ownerId),
    ]);
    if (viewer?.clubId && owner?.clubId && viewer.clubId === owner.clubId) return "summary";
    return "none";
  }

  private async get(id: string): Promise<RallySession> {
    const s = await this.repo.findById(id);
    if (!s) throw new NotFoundError("Session not found");
    return s;
  }

  private async getOwned(id: string, userId: string): Promise<RallySession> {
    const s = await this.get(id);
    if (s.ownerId !== userId) throw new ForbiddenError("Only the owner can do this");
    return s;
  }

  async getForViewer(id: string, userId: string): Promise<{ session: RallySession; access: Access }> {
    const session = await this.get(id);
    const access = await this.accessFor(session, userId);
    if (access === "none") throw new NotFoundError("Session not found");
    return { session, access };
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  /** Idempotent on (owner, clientId): offline-created sessions sync safely. */
  async create(
    ownerId: string,
    data: {
      clientId: string;
      title?: string | null;
      recordedAt: string;
      durationS: number;
      gameId?: string | null;
      trainingDate?: string | null;
    },
  ): Promise<RallySession> {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(data.clientId)) throw new ValidationError("Invalid clientId");
    if (!(data.durationS > 0) || data.durationS > 6 * 3600) throw new ValidationError("Invalid duration");
    const recordedAt = new Date(data.recordedAt);
    if (Number.isNaN(recordedAt.getTime())) throw new ValidationError("Invalid recordedAt");
    const existing = await this.repo.findByClientId(ownerId, data.clientId);
    if (existing) return existing;
    return this.repo.create({
      ownerId,
      clientId: data.clientId,
      title: data.title ?? null,
      recordedAt,
      durationS: data.durationS,
      gameId: data.gameId ?? null,
      trainingDate: data.trainingDate ?? null,
    });
  }

  listForUser(userId: string): Promise<RallySession[]> {
    return this.repo.findForUser(userId);
  }

  async listForGame(gameId: string, userId: string): Promise<{ session: RallySession; access: Access }[]> {
    const sessions = await this.repo.findByGameId(gameId);
    const out: { session: RallySession; access: Access }[] = [];
    for (const session of sessions) {
      const access = await this.accessFor(session, userId);
      if (access !== "none") out.push({ session, access });
    }
    return out;
  }

  async update(id: string, userId: string, input: UpdateRallySessionInput): Promise<RallySession> {
    const s = await this.getOwned(id, userId);
    const patch: RallySessionPatch = {};
    if (input.title !== undefined) patch.title = input.title?.slice(0, 120) ?? null;
    if (input.format !== undefined) patch.format = input.format;
    if (input.gameId !== undefined) patch.gameId = input.gameId;
    if (input.trainingDate !== undefined) {
      if (input.trainingDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.trainingDate)) {
        throw new ValidationError("trainingDate must be YYYY-MM-DD");
      }
      patch.trainingDate = input.trainingDate;
    }
    if (input.participants !== undefined) {
      const seen = new Set<string>();
      for (const p of input.participants) {
        if (!/^P[1-6]$/.test(p.playerId)) throw new ValidationError("Invalid playerId");
        if (seen.has(p.playerId)) throw new ValidationError("Duplicate playerId");
        seen.add(p.playerId);
      }
      const users = await this.users.findByIds([...new Set(input.participants.map((p) => p.userId))]);
      if (users.length !== new Set(input.participants.map((p) => p.userId)).size) {
        throw new ValidationError("Unknown user");
      }
      patch.participants = input.participants;
    }
    if (input.pinned !== undefined && input.pinned !== s.pinned) {
      if (input.pinned) {
        const pins = (await this.repo.findForUser(userId)).filter((x) => x.ownerId === userId && x.pinned);
        if (pins.length >= RALLY_LIMITS.maxPins) {
          throw new ConflictError(`You can pin up to ${RALLY_LIMITS.maxPins} videos`);
        }
      }
      patch.pinned = input.pinned;
    }
    if (input.corrections !== undefined) {
      if (JSON.stringify(input.corrections ?? null).length > 200_000) {
        throw new ValidationError("Corrections too large");
      }
      patch.corrections = input.corrections;
    }
    if (input.shareForTraining !== undefined) patch.shareForTraining = input.shareForTraining;
    return this.repo.update(id, patch);
  }

  /** A linked player can remove themselves from someone else's session. */
  async leave(id: string, userId: string): Promise<void> {
    const s = await this.get(id);
    if (!s.participants.some((p) => p.userId === userId)) throw new NotFoundError("Session not found");
    await this.repo.update(id, { participants: s.participants.filter((p) => p.userId !== userId) });
  }

  async delete(id: string, userId: string): Promise<void> {
    const s = await this.getOwned(id, userId);
    await Promise.all(
      [s.videoKey, s.resultKey].filter((k): k is string => !!k).map((k) => this.storage.delete(k)),
    );
    await this.repo.delete(id);
  }

  // ── Video ─────────────────────────────────────────────────────────────────

  async usage(userId: string): Promise<{ usedBytes: number; limitBytes: number }> {
    const mine = (await this.repo.findForUser(userId)).filter((s) => s.ownerId === userId && s.videoKey);
    return {
      usedBytes: mine.reduce((sum, s) => sum + (s.videoBytes ?? 0), 0),
      limitBytes: RALLY_LIMITS.quotaBytes,
    };
  }

  async requestVideoUpload(id: string, userId: string, bytes: number, contentType: string) {
    const s = await this.getOwned(id, userId);
    if (!this.storage.configured) throw new ConflictError("Video storage is not configured");
    if (!VIDEO_TYPES.includes(contentType)) throw new ValidationError("Unsupported video type");
    if (!(bytes > 0) || bytes > RALLY_LIMITS.maxVideoBytes) throw new ValidationError("Invalid size");
    const usage = await this.usage(userId);
    const projected = usage.usedBytes - (s.videoBytes ?? 0) + bytes;
    if (projected > RALLY_LIMITS.quotaBytes * 1.2) {
      throw new QuotaError("Storage full: delete or unpin old videos first");
    }
    const key = `sessions/${s.id}/review.${contentType === "video/webm" ? "webm" : "mp4"}`;
    const url = await this.storage.presignPut(key, contentType, 3 * 3600);
    return {
      key,
      url,
      contentType,
      usage: { usedBytes: projected, limitBytes: usage.limitBytes },
      overSoftCap: projected > RALLY_LIMITS.quotaBytes,
    };
  }

  async completeVideoUpload(id: string, userId: string, key: string, bytes: number): Promise<RallySession> {
    const s = await this.getOwned(id, userId);
    if (!key.startsWith(`sessions/${s.id}/`)) throw new ValidationError("Invalid key");
    const now = this.clock();
    return this.repo.update(id, {
      videoKey: key,
      videoBytes: bytes,
      videoUploadedAt: now,
      videoExpiresAt: new Date(now.getTime() + RALLY_LIMITS.videoRetentionDays * 86400_000),
    });
  }

  async videoUrl(id: string, userId: string): Promise<{ url: string; expiresAt: Date | null }> {
    const { session, access } = await this.getForViewer(id, userId);
    if (access !== "full") throw new ForbiddenError("Video is private to the players");
    if (!session.videoKey) throw new NotFoundError("No video for this session");
    return { url: await this.storage.presignGet(session.videoKey, 6 * 3600), expiresAt: session.videoExpiresAt };
  }

  // ── Analysis ──────────────────────────────────────────────────────────────

  /** Exactly one device analyses a session at a time (lease, renewable). */
  async acquireLock(id: string, userId: string, deviceId: string) {
    await this.getOwned(id, userId);
    const now = this.clock();
    const until = new Date(now.getTime() + RALLY_LIMITS.lockMinutes * 60_000);
    const s = await this.repo.acquireLock(id, deviceId, until, now);
    if (!s) throw new ConflictError("Another device is analysing this session");
    if (s.status !== "analysed") await this.repo.update(id, { status: "analysing" });
    return { deviceId, until };
  }

  async releaseLock(id: string, userId: string, deviceId: string, failed = false): Promise<void> {
    const s = await this.getOwned(id, userId);
    if (s.analysisLock?.deviceId !== deviceId) return;
    await this.repo.update(id, {
      analysisLock: null,
      ...(failed && s.status !== "analysed" ? { status: "failed" as const } : {}),
    });
  }

  async requestResultUpload(id: string, userId: string) {
    const s = await this.getOwned(id, userId);
    if (!this.storage.configured) return null;
    const key = `sessions/${s.id}/analysis.json.gz`;
    return { key, url: await this.storage.presignPut(key, "application/gzip", 3600) };
  }

  async submitResult(
    id: string,
    userId: string,
    data: { summary: unknown; format: RallyFormat; resultKey?: string | null; deviceId: string },
  ): Promise<RallySession> {
    const s = await this.getOwned(id, userId);
    if (s.analysisLock && s.analysisLock.deviceId !== data.deviceId && s.analysisLock.until > this.clock()) {
      throw new ConflictError("Another device holds the analysis lock");
    }
    if (data.resultKey && !data.resultKey.startsWith(`sessions/${s.id}/`)) throw new ValidationError("Invalid key");
    if (JSON.stringify(data.summary ?? null).length > 1_000_000) throw new ValidationError("Summary too large");
    return this.repo.update(id, {
      summary: data.summary,
      format: s.format ?? data.format,
      resultKey: data.resultKey ?? s.resultKey,
      status: "analysed",
      analysisLock: null,
    });
  }

  async resultUrl(id: string, userId: string): Promise<{ url: string }> {
    const { session, access } = await this.getForViewer(id, userId);
    if (access !== "full") throw new ForbiddenError("Full analysis is private to the players");
    if (!session.resultKey) throw new NotFoundError("No analysis uploaded");
    return { url: await this.storage.presignGet(session.resultKey, 3600) };
  }

  // ── Retention ─────────────────────────────────────────────────────────────

  /** Deletes expired, unpinned review videos. Stats are kept forever. */
  async purgeExpiredVideos(): Promise<number> {
    const expired = await this.repo.findExpiredVideos(this.clock());
    for (const s of expired) {
      if (s.videoKey) await this.storage.delete(s.videoKey);
      await this.repo.update(s.id, { videoKey: null, videoBytes: null, videoExpiresAt: null });
    }
    return expired.length;
  }

  // ── Profile ───────────────────────────────────────────────────────────────

  /** Analysed sessions where the user is a linked player, newest first. */
  async sessionsForProfile(profileUserId: string, viewerId: string) {
    const sessions = (await this.repo.findWithParticipant(profileUserId)).filter(
      (s) => s.status === "analysed" && s.summary,
    );
    const out: { session: RallySession; playerId: string }[] = [];
    for (const s of sessions) {
      if ((await this.accessFor(s, viewerId)) === "none") continue;
      const p = s.participants.find((x) => x.userId === profileUserId);
      if (p) out.push({ session: s, playerId: p.playerId });
    }
    return out;
  }
}
