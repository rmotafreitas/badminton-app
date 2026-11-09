import {
  type Actor,
  BusinessRuleViolation,
  Conflict,
  Forbidden,
  isCalendarDay,
  isObjectId,
  NotFound,
  RALLY_LIMITS,
  RALLY_VIDEO_TYPES,
  type RallyAccess,
  type RallyFormat,
  type RallyParticipant,
  type RallySession,
  QuotaExceeded,
  rallyAccess,
  sessionKeyPrefix,
} from "@bb/domain";
import type { UserRepository } from "@/identity";
import type { Clock, ObjectStorage } from "@/shared";
import type { RallySessionPatch, RallySessionRepository } from "./ports";

export interface RallyDeps {
  readonly sessions: RallySessionRepository;
  readonly users: UserRepository;
  readonly storage: ObjectStorage;
  readonly clock: Clock;
}

export interface ViewedSession {
  readonly session: RallySession;
  readonly access: Exclude<RallyAccess, "none">;
}

/** Shared lookups for every rally use case. */
export class RallyAccessPolicy {
  constructor(private readonly deps: Pick<RallyDeps, "sessions" | "users">) {}

  async load(id: string): Promise<RallySession> {
    const session = isObjectId(id) ? await this.deps.sessions.findById(id) : null;
    if (!session) throw new NotFound("Session not found.");
    return session;
  }

  async accessFor(session: RallySession, actor: Actor): Promise<RallyAccess> {
    if (session.ownerId === actor.userId || session.participants.some((p) => p.userId === actor.userId)) return "full";
    const owner = actor.clubId ? await this.deps.users.findById(session.ownerId) : null;
    return rallyAccess(session, actor, owner?.clubId ?? null);
  }

  async view(id: string, actor: Actor): Promise<ViewedSession> {
    const session = await this.load(id);
    const access = await this.accessFor(session, actor);
    if (access === "none") throw new NotFound("Session not found.");
    return { session, access };
  }

  /** Only the owner changes a session. Others who can see it get 403; others 404. */
  async owned(id: string, actor: Actor): Promise<RallySession> {
    const session = await this.load(id);
    if (session.ownerId === actor.userId) return session;
    if ((await this.accessFor(session, actor)) === "none") throw new NotFound("Session not found.");
    throw new Forbidden("Only the person who recorded this session can do this.");
  }
}

/** Base of every rally use case: the adapters, and the access rules over them. */
export abstract class RallyUseCase {
  protected readonly policy: RallyAccessPolicy;
  constructor(protected readonly deps: RallyDeps) {
    this.policy = new RallyAccessPolicy(deps);
  }
}

/** Idempotent on (owner, clientId): sessions created offline sync safely. */
export class CreateRallySession extends RallyUseCase {
  async execute({
    actor,
    input,
  }: {
    actor: Actor;
    input: { clientId: string; title?: string | null; recordedAt: string; durationS: number; gameId?: string | null; trainingDate?: string | null };
  }): Promise<RallySession> {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.clientId)) throw new BusinessRuleViolation("Invalid clientId.");
    if (!(input.durationS > 0) || input.durationS > 6 * 3600) throw new BusinessRuleViolation("Invalid duration.");
    const recordedAt = new Date(input.recordedAt);
    if (Number.isNaN(recordedAt.getTime())) throw new BusinessRuleViolation("Invalid recordedAt.");
    const existing = await this.deps.sessions.findByClientId(actor.userId, input.clientId);
    if (existing) return existing;
    return this.deps.sessions.create({
      ownerId: actor.userId,
      clientId: input.clientId,
      title: input.title?.slice(0, 120) ?? null,
      recordedAt,
      durationS: input.durationS,
      gameId: input.gameId && isObjectId(input.gameId) ? input.gameId : null,
      trainingDate: input.trainingDate ?? null,
    });
  }
}

export class ListMyRallySessions extends RallyUseCase {
  execute({ actor }: { actor: Actor }): Promise<RallySession[]> {
    return this.deps.sessions.findForUser(actor.userId);
  }
}

export class ListGameRallySessions extends RallyUseCase {
  async execute({ actor, gameId }: { actor: Actor; gameId: string }): Promise<ViewedSession[]> {
    if (!isObjectId(gameId)) return [];
    const out: ViewedSession[] = [];
    for (const session of await this.deps.sessions.findByGameId(gameId)) {
      const access = await this.policy.accessFor(session, actor);
      if (access !== "none") out.push({ session, access });
    }
    return out;
  }
}

export class GetRallySession extends RallyUseCase {
  execute({ actor, id }: { actor: Actor; id: string }): Promise<ViewedSession> {
    return this.policy.view(id, actor);
  }
}

export interface UpdateRallySessionInput {
  readonly title?: string | null;
  readonly format?: RallyFormat | null;
  readonly gameId?: string | null;
  readonly trainingDate?: string | null;
  readonly participants?: readonly RallyParticipant[];
  readonly pinned?: boolean;
  readonly corrections?: unknown;
  readonly shareForTraining?: boolean;
}

export class UpdateRallySession extends RallyUseCase {

  async execute({ actor, id, input }: { actor: Actor; id: string; input: UpdateRallySessionInput }): Promise<RallySession> {
    const session = await this.policy.owned(id, actor);
    const patch: RallySessionPatch = {};
    if (input.title !== undefined) patch.title = input.title?.slice(0, 120) ?? null;
    if (input.format !== undefined) patch.format = input.format;
    if (input.gameId !== undefined) {
      if (input.gameId !== null && !isObjectId(input.gameId)) throw new BusinessRuleViolation("Invalid gameId.");
      patch.gameId = input.gameId;
    }
    if (input.trainingDate !== undefined) {
      if (input.trainingDate !== null && !isCalendarDay(input.trainingDate)) {
        throw new BusinessRuleViolation("trainingDate must be YYYY-MM-DD.");
      }
      patch.trainingDate = input.trainingDate;
    }
    if (input.participants !== undefined) patch.participants = await this.checkParticipants(input.participants);
    if (input.pinned !== undefined && input.pinned !== session.pinned) {
      if (input.pinned) {
        const pins = (await this.deps.sessions.findForUser(actor.userId)).filter((s) => s.ownerId === actor.userId && s.pinned);
        if (pins.length >= RALLY_LIMITS.maxPins) throw new Conflict(`You can pin up to ${RALLY_LIMITS.maxPins} videos.`, "pin_limit");
      }
      patch.pinned = input.pinned;
    }
    if (input.corrections !== undefined) {
      if (JSON.stringify(input.corrections ?? null).length > RALLY_LIMITS.maxCorrectionsChars) {
        throw new BusinessRuleViolation("Corrections too large.");
      }
      patch.corrections = input.corrections;
    }
    if (input.shareForTraining !== undefined) patch.shareForTraining = input.shareForTraining;
    return this.deps.sessions.update(id, patch);
  }

  private async checkParticipants(participants: readonly RallyParticipant[]) {
    const seen = new Set<string>();
    for (const p of participants) {
      if (!/^P[1-6]$/.test(p.playerId)) throw new BusinessRuleViolation("Invalid playerId.");
      if (seen.has(p.playerId)) throw new BusinessRuleViolation("Duplicate playerId.");
      seen.add(p.playerId);
    }
    const userIds = [...new Set(participants.map((p) => p.userId))];
    if (!userIds.every(isObjectId) || (await this.deps.users.findByIds(userIds)).length !== userIds.length) {
      throw new BusinessRuleViolation("Unknown user.");
    }
    return participants;
  }
}

/** A linked player can remove themselves from someone else's session. */
export class LeaveRallySession extends RallyUseCase {
  async execute({ actor, id }: { actor: Actor; id: string }): Promise<void> {
    const session = await this.policy.load(id);
    if (!session.participants.some((p) => p.userId === actor.userId)) throw new NotFound("Session not found.");
    await this.deps.sessions.update(id, { participants: session.participants.filter((p) => p.userId !== actor.userId) });
  }
}

export class DeleteRallySession extends RallyUseCase {
  async execute({ actor, id }: { actor: Actor; id: string }): Promise<void> {
    const session = await this.policy.owned(id, actor);
    await Promise.all(
      [session.videoKey, session.resultKey].filter((k): k is string => !!k).map((k) => this.deps.storage.delete(k)),
    );
    await this.deps.sessions.delete(id);
  }
}

// ── Video ────────────────────────────────────────────────────────────────────

async function usageOf(sessions: RallySessionRepository, userId: string) {
  const mine = (await sessions.findForUser(userId)).filter((s) => s.ownerId === userId && s.videoKey);
  return { usedBytes: mine.reduce((sum, s) => sum + (s.videoBytes ?? 0), 0), limitBytes: RALLY_LIMITS.quotaBytes };
}

export class GetRallyUsage extends RallyUseCase {
  execute({ actor }: { actor: Actor }) {
    return usageOf(this.deps.sessions, actor.userId);
  }
}

export class RequestVideoUpload extends RallyUseCase {
  async execute({ actor, id, bytes, contentType }: { actor: Actor; id: string; bytes: number; contentType: string }) {
    const session = await this.policy.owned(id, actor);
    if (!this.deps.storage.configured) throw new Conflict("Video storage is not configured.", "storage_unavailable");
    if (!(RALLY_VIDEO_TYPES as readonly string[]).includes(contentType)) throw new BusinessRuleViolation("Unsupported video type.");
    if (!(bytes > 0) || bytes > RALLY_LIMITS.maxVideoBytes) throw new BusinessRuleViolation("Invalid size.");
    const usage = await usageOf(this.deps.sessions, actor.userId);
    const projected = usage.usedBytes - (session.videoBytes ?? 0) + bytes;
    if (projected > RALLY_LIMITS.quotaBytes * 1.2) throw new QuotaExceeded("Storage full: delete or unpin old videos first.");
    const key = `${sessionKeyPrefix(session.id)}review.${contentType === "video/webm" ? "webm" : "mp4"}`;
    const url = await this.deps.storage.presignPut(key, contentType, 3 * 3600);
    return {
      key,
      url,
      contentType,
      usage: { usedBytes: projected, limitBytes: usage.limitBytes },
      overSoftCap: projected > RALLY_LIMITS.quotaBytes,
    };
  }
}

export class CompleteVideoUpload extends RallyUseCase {
  async execute({ actor, id, key, bytes }: { actor: Actor; id: string; key: string; bytes: number }): Promise<RallySession> {
    const session = await this.policy.owned(id, actor);
    if (!key.startsWith(sessionKeyPrefix(session.id))) throw new BusinessRuleViolation("Invalid key.");
    const now = this.deps.clock.now();
    return this.deps.sessions.update(id, {
      videoKey: key,
      videoBytes: bytes,
      videoUploadedAt: now,
      videoExpiresAt: new Date(now.getTime() + RALLY_LIMITS.videoRetentionDays * 86_400_000),
    });
  }
}

export class GetVideoUrl extends RallyUseCase {
  async execute({ actor, id }: { actor: Actor; id: string }) {
    const { session, access } = await this.policy.view(id, actor);
    if (access !== "full") throw new Forbidden("The video is private to the players.");
    if (!session.videoKey) throw new NotFound("No video for this session.");
    return { url: await this.deps.storage.presignGet(session.videoKey, 6 * 3600), expiresAt: session.videoExpiresAt };
  }
}

// ── Analysis ─────────────────────────────────────────────────────────────────

/** Exactly one device analyses a session at a time (renewable lease). */
export class AcquireAnalysisLock extends RallyUseCase {
  async execute({ actor, id, deviceId }: { actor: Actor; id: string; deviceId: string }) {
    await this.policy.owned(id, actor);
    const now = this.deps.clock.now();
    const until = new Date(now.getTime() + RALLY_LIMITS.lockMinutes * 60_000);
    const session = await this.deps.sessions.acquireLock(id, deviceId, until, now);
    if (!session) throw new Conflict("Another device is analysing this session.", "locked");
    if (session.status !== "analysed") await this.deps.sessions.update(id, { status: "analysing" });
    return { deviceId, until };
  }
}

export class ReleaseAnalysisLock extends RallyUseCase {
  async execute({ actor, id, deviceId, failed = false }: { actor: Actor; id: string; deviceId: string; failed?: boolean }) {
    const session = await this.policy.owned(id, actor);
    if (session.analysisLock?.deviceId !== deviceId) return;
    await this.deps.sessions.update(id, {
      analysisLock: null,
      ...(failed && session.status !== "analysed" ? { status: "failed" as const } : {}),
    });
  }
}

export class RequestResultUpload extends RallyUseCase {
  async execute({ actor, id }: { actor: Actor; id: string }) {
    const session = await this.policy.owned(id, actor);
    if (!this.deps.storage.configured) return null;
    const key = `${sessionKeyPrefix(session.id)}analysis.json.gz`;
    return { key, url: await this.deps.storage.presignPut(key, "application/gzip", 3600) };
  }
}

export class SubmitAnalysisResult extends RallyUseCase {
  async execute({
    actor,
    id,
    input,
  }: {
    actor: Actor;
    id: string;
    input: { summary: unknown; format: RallyFormat; resultKey?: string | null; deviceId: string };
  }): Promise<RallySession> {
    const session = await this.policy.owned(id, actor);
    const lock = session.analysisLock;
    if (lock && lock.deviceId !== input.deviceId && lock.until > this.deps.clock.now()) {
      throw new Conflict("Another device holds the analysis lock.", "locked");
    }
    if (input.resultKey && !input.resultKey.startsWith(sessionKeyPrefix(session.id))) throw new BusinessRuleViolation("Invalid key.");
    if (JSON.stringify(input.summary ?? null).length > RALLY_LIMITS.maxSummaryChars) throw new BusinessRuleViolation("Summary too large.");
    return this.deps.sessions.update(id, {
      summary: input.summary,
      format: session.format ?? input.format,
      resultKey: input.resultKey ?? session.resultKey,
      status: "analysed",
      analysisLock: null,
    });
  }
}

export class GetResultUrl extends RallyUseCase {
  async execute({ actor, id }: { actor: Actor; id: string }) {
    const { session, access } = await this.policy.view(id, actor);
    if (access !== "full") throw new Forbidden("The full analysis is private to the players.");
    if (!session.resultKey) throw new NotFound("No analysis uploaded.");
    return { url: await this.deps.storage.presignGet(session.resultKey, 3600) };
  }
}

// ── Retention and profiles ───────────────────────────────────────────────────

/** Deletes expired, unpinned review videos. Stats are kept forever. Run by the daily cron. */
export class PurgeExpiredVideos extends RallyUseCase {
  async execute(): Promise<number> {
    const expired = await this.deps.sessions.findExpiredVideos(this.deps.clock.now());
    for (const session of expired) {
      if (session.videoKey) await this.deps.storage.delete(session.videoKey);
      await this.deps.sessions.update(session.id, { videoKey: null, videoBytes: null, videoExpiresAt: null });
    }
    return expired.length;
  }
}

/** Analysed sessions a player took part in (their profile's rally stats), newest first. */
export class ListProfileRallySessions extends RallyUseCase {
  async execute({ actor, userId }: { actor: Actor; userId: string }) {
    if (!isObjectId(userId)) return [];
    const sessions = (await this.deps.sessions.findWithParticipant(userId)).filter((s) => s.status === "analysed" && s.summary);
    const out: { session: RallySession; playerId: string }[] = [];
    for (const session of sessions) {
      if ((await this.policy.accessFor(session, actor)) === "none") continue;
      const participant = session.participants.find((p) => p.userId === userId);
      if (participant) out.push({ session, playerId: participant.playerId });
    }
    return out;
  }
}
