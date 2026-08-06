import { TrainingSessionReviewService } from "@/application/services/TrainingSessionReviewService";
import type { UpsertTrainingReviewDto } from "@/application/dtos/training-review.dto";
import type { TrainingReviewView } from "@/application/views/training-review.view";
import { TrainingReviewMapper } from "@/application/mappers/TrainingReviewMapper";

export class TrainingSessionReviewController {
  constructor(private readonly service: TrainingSessionReviewService) {}

  async upsertReview(
    currentUser: { sub: string },
    dto: UpsertTrainingReviewDto,
  ): Promise<TrainingReviewView> {
    const review = await this.service.upsertReview(currentUser.sub, dto);
    return TrainingReviewMapper.toView(review);
  }

  async getReviewByDate(
    currentUser: { sub: string },
    date: string,
  ): Promise<TrainingReviewView | null> {
    const review = await this.service.getReviewByDate(currentUser.sub, date);
    return review ? TrainingReviewMapper.toView(review) : null;
  }

  async getMyReviews(
    currentUser: { sub: string },
    from?: string,
    to?: string,
  ): Promise<TrainingReviewView[]> {
    const reviews = await this.service.getMyReviews(currentUser.sub, from, to);
    return reviews.map(TrainingReviewMapper.toView);
  }

  async deleteReview(
    currentUser: { sub: string },
    reviewId: string,
  ): Promise<{ success: boolean }> {
    await this.service.deleteReview(currentUser.sub, reviewId);
    return { success: true };
  }
}
