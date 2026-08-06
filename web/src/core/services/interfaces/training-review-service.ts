import type { TrainingReview, UpsertTrainingReviewParams } from "@/core/domain/training-review";

export interface TrainingReviewService {
  upsertReview(params: UpsertTrainingReviewParams): Promise<TrainingReview>;
  getReviewByDate(date: string): Promise<TrainingReview | null>;
  getMyReviews(from?: string, to?: string): Promise<TrainingReview[]>;
  deleteReview(reviewId: string): Promise<void>;
}
