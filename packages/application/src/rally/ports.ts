import type { RallyAnalysisLock, RallyFormat, RallyParticipant, RallySession, RallySessionStatus } from "@bb/domain";

export interface NewRallySession {
  readonly ownerId: string;
  readonly clientId: string;
  readonly title: string | null;
  readonly recordedAt: Date;
  readonly durationS: number;
  readonly gameId: string | null;
  readonly trainingDate: string | null;
}

export interface RallySessionPatch {
  title?: string | null;
  status?: RallySessionStatus;
  format?: RallyFormat | null;
  gameId?: string | null;
  trainingDate?: string | null;
  participants?: readonly RallyParticipant[];
  videoKey?: string | null;
  videoBytes?: number | null;
  videoUploadedAt?: Date | null;
  videoExpiresAt?: Date | null;
  pinned?: boolean;
  resultKey?: string | null;
  summary?: unknown;
  corrections?: unknown;
  analysisLock?: RallyAnalysisLock | null;
  shareForTraining?: boolean;
}

export interface RallySessionRepository {
  create(input: NewRallySession): Promise<RallySession>;
  findById(id: string): Promise<RallySession | null>;
  findByClientId(ownerId: string, clientId: string): Promise<RallySession | null>;
  /** Sessions the user owns or takes part in, newest first. */
  findForUser(userId: string): Promise<RallySession[]>;
  /** Sessions where the user is a linked participant (profile stats). */
  findWithParticipant(userId: string): Promise<RallySession[]>;
  findByGameId(gameId: string): Promise<RallySession[]>;
  /** Unpinned sessions whose video expired before `now`. */
  findExpiredVideos(now: Date): Promise<RallySession[]>;
  update(id: string, patch: RallySessionPatch): Promise<RallySession>;
  /** Atomically takes the lock if free, expired, or already held by this device. Null when someone else holds it. */
  acquireLock(id: string, deviceId: string, until: Date, now: Date): Promise<RallySession | null>;
  delete(id: string): Promise<void>;
}
