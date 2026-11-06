import type { RallySession } from "@/domain/entities/RallySession";
import type { RallySessionView } from "@/application/views/rally-session.view";

export class RallySessionMapper {
  static toDomain(r: any): RallySession {
    return {
      id: r.id,
      ownerId: r.ownerId,
      clientId: r.clientId,
      title: r.title ?? null,
      recordedAt: r.recordedAt,
      durationS: r.durationS,
      status: r.status,
      format: r.format ?? null,
      gameId: r.gameId ?? null,
      trainingDate: r.trainingDate ?? null,
      participants: (r.participants ?? []).map((p: any) => ({ playerId: p.playerId, userId: p.userId })),
      videoKey: r.videoKey ?? null,
      videoBytes: r.videoBytes ?? null,
      videoUploadedAt: r.videoUploadedAt ?? null,
      videoExpiresAt: r.videoExpiresAt ?? null,
      pinned: !!r.pinned,
      resultKey: r.resultKey ?? null,
      summary: r.summary ?? null,
      corrections: r.corrections ?? null,
      analysisLock: r.analysisLock ? { deviceId: r.analysisLock.deviceId, until: r.analysisLock.until } : null,
      shareForTraining: !!r.shareForTraining,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  /**
   * "summary" access (club-mates) hides corrections, video and lock state:
   * they see the stats, not the footage.
   */
  static toView(s: RallySession, access: "full" | "summary"): RallySessionView {
    const base = {
      id: s.id,
      ownerId: s.ownerId,
      title: s.title,
      recordedAt: s.recordedAt,
      durationS: s.durationS,
      status: s.status,
      format: s.format,
      gameId: s.gameId,
      trainingDate: s.trainingDate,
      participants: s.participants,
      summary: s.summary,
      access,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
    if (access === "summary") return base;
    return {
      ...base,
      clientId: s.clientId,
      hasVideo: !!s.videoKey,
      videoBytes: s.videoBytes,
      videoExpiresAt: s.videoExpiresAt,
      pinned: s.pinned,
      hasResult: !!s.resultKey,
      corrections: s.corrections,
      analysisLock: s.analysisLock,
      shareForTraining: s.shareForTraining,
    };
  }
}
