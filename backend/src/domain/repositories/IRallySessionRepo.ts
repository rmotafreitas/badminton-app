import type { RallySession } from "../entities/RallySession";

export interface CreateRallySessionParams {
  ownerId: string;
  clientId: string;
  title?: string | null;
  recordedAt: Date;
  durationS: number;
  gameId?: string | null;
  trainingDate?: string | null;
}

export type RallySessionPatch = Partial<
  Pick<
    RallySession,
    | "title"
    | "status"
    | "format"
    | "gameId"
    | "trainingDate"
    | "participants"
    | "videoKey"
    | "videoBytes"
    | "videoUploadedAt"
    | "videoExpiresAt"
    | "pinned"
    | "resultKey"
    | "summary"
    | "corrections"
    | "analysisLock"
    | "shareForTraining"
  >
>;

export interface IRallySessionRepo {
  create(data: CreateRallySessionParams): Promise<RallySession>;
  findById(id: string): Promise<RallySession | null>;
  findByClientId(ownerId: string, clientId: string): Promise<RallySession | null>;
  /** Sessions the user owns or takes part in, newest first. */
  findForUser(userId: string): Promise<RallySession[]>;
  /** Sessions where the user is a linked participant (for profile stats). */
  findWithParticipant(userId: string): Promise<RallySession[]>;
  findByGameId(gameId: string): Promise<RallySession[]>;
  /** Unpinned sessions whose video expired before `now`. */
  findExpiredVideos(now: Date): Promise<RallySession[]>;
  update(id: string, patch: RallySessionPatch): Promise<RallySession>;
  /**
   * Atomically takes the analysis lock if free, expired or already held by
   * this device. Returns the session when acquired, null otherwise.
   */
  acquireLock(id: string, deviceId: string, until: Date, now: Date): Promise<RallySession | null>;
  delete(id: string): Promise<void>;
}
