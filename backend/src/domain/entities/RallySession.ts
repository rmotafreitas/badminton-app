/**
 * A recorded rally / practice session analysed on the user's device.
 * The video (720p review copy) and the full frame-by-frame analysis live in
 * object storage; Mongo keeps the summary that lists/profiles need.
 */
export type RallySessionStatus = "pending" | "analysing" | "analysed" | "failed";
export type RallyFormat = "singles" | "doubles" | "practice";

export interface RallyParticipant {
  /** Engine label, e.g. "P1". */
  playerId: string;
  userId: string;
}

export interface RallyAnalysisLock {
  deviceId: string;
  until: Date;
}

export interface RallySession {
  id: string;
  ownerId: string;
  /** Client-generated id: offline creation is idempotent. */
  clientId: string;
  title: string | null;
  recordedAt: Date;
  durationS: number;
  status: RallySessionStatus;
  format: RallyFormat | null;
  gameId: string | null;
  trainingDate: string | null;
  participants: RallyParticipant[];
  videoKey: string | null;
  videoBytes: number | null;
  videoUploadedAt: Date | null;
  videoExpiresAt: Date | null;
  pinned: boolean;
  resultKey: string | null;
  /** Compact stats + shots (see web AnalysisResult). */
  summary: unknown | null;
  /** Person corrections (see web Corrections). */
  corrections: unknown | null;
  analysisLock: RallyAnalysisLock | null;
  shareForTraining: boolean;
  createdAt: Date;
  updatedAt: Date;
}
