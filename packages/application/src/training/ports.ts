import type { TrainingReview } from "@bb/domain";

export interface TrainingReviewRepository {
  upsert(input: { userId: string; date: string; effort: number; note: string | null }): Promise<TrainingReview>;
  findById(id: string): Promise<TrainingReview | null>;
  findByUserAndDate(userId: string, date: string): Promise<TrainingReview | null>;
  /** Inclusive day range; either end may be open. Newest first. */
  listByUser(userId: string, range: { from?: string; to?: string }): Promise<TrainingReview[]>;
  delete(id: string): Promise<void>;
}
