import type { TrainingReviewRepo } from "@/core/repositories/interfaces/training-review-repo";
import type { TrainingReview, UpsertTrainingReviewParams } from "@/core/domain/training-review";
import type { TrainingReviewView } from "@/core/views/training-review.view";
import { TrainingReviewMapper } from "@/core/mappers/training-review-mapper";
import api from "@/lib/api";

export class TrainingReviewRepoImpl implements TrainingReviewRepo {
  async upsert(params: UpsertTrainingReviewParams): Promise<TrainingReview> {
    const { data } = await api.put<TrainingReviewView>("/training-reviews", params);
    return TrainingReviewMapper.toDomain(data);
  }

  async getByDate(date: string): Promise<TrainingReview | null> {
    const { data } = await api.get<TrainingReviewView>(`/training-reviews/me/${date}`);
    return data ? TrainingReviewMapper.toDomain(data) : null;
  }

  async getMyReviews(from?: string, to?: string): Promise<TrainingReview[]> {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    const { data } = await api.get<TrainingReviewView[]>(
      `/training-reviews/me${qs ? `?${qs}` : ""}`,
    );
    return data.map(TrainingReviewMapper.toDomain);
  }

  async delete(reviewId: string): Promise<void> {
    await api.delete(`/training-reviews/${reviewId}`);
  }
}
