import type { RallySession } from "@/core/domain/rally";

type Raw = Omit<RallySession, "recordedAt" | "videoExpiresAt" | "analysisLock"> & {
  recordedAt: string | Date;
  videoExpiresAt?: string | Date | null;
  analysisLock?: { deviceId: string; until: string | Date } | null;
};

export class RallyMapper {
  static toDomain(v: Raw): RallySession {
    return {
      ...v,
      recordedAt: new Date(v.recordedAt),
      videoExpiresAt: v.videoExpiresAt ? new Date(v.videoExpiresAt) : (v.videoExpiresAt ?? null),
      analysisLock: v.analysisLock ? { ...v.analysisLock, until: new Date(v.analysisLock.until) } : null,
    } as RallySession;
  }
}
