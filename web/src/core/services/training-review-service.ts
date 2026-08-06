import type { TrainingReviewService } from "@/core/services/interfaces/training-review-service";
import type { TrainingReviewRepo } from "@/core/repositories/interfaces/training-review-repo";
import type { TrainingReview, UpsertTrainingReviewParams } from "@/core/domain/training-review";

export class TrainingReviewServiceImpl implements TrainingReviewService {
  private readonly repo: TrainingReviewRepo;

  constructor(repo: TrainingReviewRepo) {
    this.repo = repo;
  }

  async upsertReview(params: UpsertTrainingReviewParams): Promise<TrainingReview> {
    return this.repo.upsert(params);
  }

  async getReviewByDate(date: string): Promise<TrainingReview | null> {
    return this.repo.getByDate(date);
  }

  async getMyReviews(from?: string, to?: string): Promise<TrainingReview[]> {
    return this.repo.getMyReviews(from, to);
  }

  async deleteReview(reviewId: string): Promise<void> {
    return this.repo.delete(reviewId);
  }
}
