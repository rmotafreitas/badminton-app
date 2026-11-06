/** Rally Analysis session as the server knows it (see backend RallySession). */
export type RallyFormat = "singles" | "doubles" | "practice";
export type RallyStatus = "pending" | "analysing" | "analysed" | "failed";

export interface RallyParticipant {
  playerId: string;
  userId: string;
}

/**
 * Compact analysis summary stored server-side: enough for lists, the
 * session header, club-mates and profile stats without downloading the
 * full frame-by-frame analysis.
 */
export interface RallySummary {
  version: 1;
  format: RallyFormat;
  durationS: number;
  calibrationScore: number | null;
  stats: import("@/rally/engine/types").SessionStats;
  shots: {
    id: string;
    rallyId: string;
    t: number;
    hitter: string | null;
    type: string;
    speedKmh: number | null;
    speedConfidence: string;
    reviewed?: boolean;
  }[];
}

export interface RallySession {
  id: string;
  ownerId: string;
  clientId?: string;
  title: string | null;
  recordedAt: Date;
  durationS: number;
  status: RallyStatus;
  format: RallyFormat | null;
  gameId: string | null;
  trainingDate: string | null;
  participants: RallyParticipant[];
  summary: RallySummary | null;
  access: "full" | "summary";
  hasVideo?: boolean;
  videoBytes?: number | null;
  videoExpiresAt?: Date | null;
  pinned?: boolean;
  hasResult?: boolean;
  corrections?: import("@/rally/engine/types").Corrections | null;
  analysisLock?: { deviceId: string; until: Date } | null;
  shareForTraining?: boolean;
}

export interface CreateRallySessionParams {
  clientId: string;
  title?: string | null;
  recordedAt: string;
  durationS: number;
  gameId?: string | null;
  trainingDate?: string | null;
}

export interface UpdateRallySessionParams {
  title?: string | null;
  format?: RallyFormat | null;
  gameId?: string | null;
  trainingDate?: string | null;
  participants?: RallyParticipant[];
  pinned?: boolean;
  corrections?: unknown;
  shareForTraining?: boolean;
}

export interface PresignedUpload {
  key: string;
  url: string;
  contentType?: string;
  usage?: { usedBytes: number; limitBytes: number };
  overSoftCap?: boolean;
}

export interface RallyProfileEntry {
  id: string;
  recordedAt: Date;
  durationS: number;
  format: RallyFormat | null;
  playerId: string;
  summary: RallySummary | null;
}
