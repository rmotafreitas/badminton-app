import type {
  CreateRallySessionParams,
  PresignedUpload,
  RallyFormat,
  RallyProfileEntry,
  RallySession,
  RallySummary,
  UpdateRallySessionParams,
} from "@/core/domain/rally";

export interface RallyRepo {
  create(params: CreateRallySessionParams): Promise<RallySession>;
  list(): Promise<RallySession[]>;
  get(id: string): Promise<RallySession>;
  listForGame(gameId: string): Promise<RallySession[]>;
  profile(userId: string): Promise<RallyProfileEntry[]>;
  update(id: string, params: UpdateRallySessionParams): Promise<RallySession>;
  delete(id: string): Promise<void>;
  leave(id: string): Promise<void>;
  usage(): Promise<{ usedBytes: number; limitBytes: number }>;
  requestVideoUpload(id: string, bytes: number, contentType: string): Promise<PresignedUpload>;
  completeVideoUpload(id: string, key: string, bytes: number): Promise<RallySession>;
  videoUrl(id: string): Promise<{ url: string; expiresAt: Date | null }>;
  lock(id: string, deviceId: string): Promise<{ deviceId: string; until: Date }>;
  unlock(id: string, deviceId: string, failed?: boolean): Promise<void>;
  requestResultUpload(id: string): Promise<PresignedUpload | null>;
  submitResult(
    id: string,
    body: { summary: RallySummary; format: RallyFormat; resultKey?: string | null; deviceId: string },
  ): Promise<RallySession>;
  resultUrl(id: string): Promise<{ url: string }>;
}
