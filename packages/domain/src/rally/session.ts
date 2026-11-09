/**
 * A recorded rally / practice session analysed on the user's device. The review video and the full frame-by-frame
 * analysis live in object storage; the database keeps the summary that lists and profiles need.
 */
export type RallySessionStatus = "pending" | "analysing" | "analysed" | "failed";
export const RALLY_FORMATS = ["singles", "doubles", "practice"] as const;
export type RallyFormat = (typeof RALLY_FORMATS)[number];

export interface RallyParticipant {
  /** Engine label, e.g. "P1". */
  readonly playerId: string;
  readonly userId: string;
}

export interface RallyAnalysisLock {
  readonly deviceId: string;
  readonly until: Date;
}

export interface RallySession {
  readonly id: string;
  readonly ownerId: string;
  /** Client-generated id: offline creation is idempotent. */
  readonly clientId: string;
  readonly title: string | null;
  readonly recordedAt: Date;
  readonly durationS: number;
  readonly status: RallySessionStatus;
  readonly format: RallyFormat | null;
  readonly gameId: string | null;
  readonly trainingDate: string | null;
  readonly participants: readonly RallyParticipant[];
  readonly videoKey: string | null;
  readonly videoBytes: number | null;
  readonly videoUploadedAt: Date | null;
  readonly videoExpiresAt: Date | null;
  readonly pinned: boolean;
  readonly resultKey: string | null;
  /** Compact stats + shots (see the web engine's AnalysisResult). */
  readonly summary: unknown;
  /** Person corrections (see the web engine's Corrections). */
  readonly corrections: unknown;
  readonly analysisLock: RallyAnalysisLock | null;
  readonly shareForTraining: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const RALLY_LIMITS = {
  /** Review videos are deleted this long after upload unless pinned. */
  videoRetentionDays: 60,
  /** Soft cap per user; uploads beyond 120 % are refused. */
  quotaBytes: 1024 ** 3,
  maxPins: 5,
  /** Single review copy: 720p60 at ~2 Mbit/s is ~15 MB/min. */
  maxVideoBytes: 2 * 1024 ** 3,
  lockMinutes: 10,
  maxCorrectionsChars: 200_000,
  maxSummaryChars: 1_000_000,
} as const;

export const RALLY_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

/** Owner + linked players see everything; club-mates see the summary; anyone else nothing. */
export type RallyAccess = "full" | "summary" | "none";

export function rallyAccess(
  session: Pick<RallySession, "ownerId" | "participants">,
  viewer: { userId: string; clubId: string | null },
  ownerClubId: string | null,
): RallyAccess {
  if (session.ownerId === viewer.userId) return "full";
  if (session.participants.some((p) => p.userId === viewer.userId)) return "full";
  if (viewer.clubId && ownerClubId && viewer.clubId === ownerClubId) return "summary";
  return "none";
}

/** Storage keys always live under the session's own prefix, so a client can't point at someone else's object. */
export const sessionKeyPrefix = (sessionId: string): string => `sessions/${sessionId}/`;
