import type { ITrainingSessionReviewRepo } from "@/domain/repositories/ITrainingSessionReviewRepo";
import type { TrainingSessionReview } from "@/domain/entities/TrainingSessionReview";

export class TrainingSessionReviewService {
  constructor(
    private readonly reviewRepo: ITrainingSessionReviewRepo,
  ) {}

  async upsertReview(
    userId: string,
    data: { date: string; effort: number; note?: string | null },
  ): Promise<TrainingSessionReview> {
    if (data.effort < 1 || data.effort > 10) {
      throw new Error("Effort must be between 1 and 10.");
    }
    return this.reviewRepo.upsert({
      userId,
      date: data.date,
      effort: data.effort,
      note: data.note ?? null,
    });
  }

  async getReviewByDate(userId: string, date: string): Promise<TrainingSessionReview | null> {
    return this.reviewRepo.findByUserAndDate(userId, date);
  }

  async getMyReviews(
    userId: string,
    from?: string,
    to?: string,
  ): Promise<TrainingSessionReview[]> {
    return this.reviewRepo.findByUserId(userId, from, to);
  }

  async deleteReview(userId: string, reviewId: string): Promise<void> {
    const review = await this.reviewRepo.findById(reviewId);
    if (!review) throw new Error("Review not found");
    if (review.userId !== userId) throw new Error("You can only delete your own reviews.");
    await this.reviewRepo.delete(reviewId);
  }
}
