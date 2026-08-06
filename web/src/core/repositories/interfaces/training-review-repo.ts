import type { TrainingReview, UpsertTrainingReviewParams } from "@/core/domain/training-review";

export interface TrainingReviewRepo {
  upsert(params: UpsertTrainingReviewParams): Promise<TrainingReview>;
  getByDate(date: string): Promise<TrainingReview | null>;
  getMyReviews(from?: string, to?: string): Promise<TrainingReview[]>;
  delete(reviewId: string): Promise<void>;
}
