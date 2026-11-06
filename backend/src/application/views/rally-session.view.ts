import type { RallyAnalysisLock, RallyParticipant } from "@/domain/entities/RallySession";

export interface RallySessionView {
  id: string;
  ownerId: string;
  title: string | null;
  recordedAt: Date;
  durationS: number;
  status: string;
  format: string | null;
  gameId: string | null;
  trainingDate: string | null;
  participants: RallyParticipant[];
  summary: unknown | null;
  access: "full" | "summary";
  createdAt: Date;
  updatedAt: Date;
  // full access only
  clientId?: string;
  hasVideo?: boolean;
  videoBytes?: number | null;
  videoExpiresAt?: Date | null;
  pinned?: boolean;
  hasResult?: boolean;
  corrections?: unknown | null;
  analysisLock?: RallyAnalysisLock | null;
  shareForTraining?: boolean;
}
