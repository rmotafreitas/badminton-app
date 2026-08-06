import type { TrainingReview } from "@/core/domain/training-review";
import type { TrainingReviewView } from "@/core/views/training-review.view";

export class TrainingReviewMapper {
  static toDomain(view: TrainingReviewView): TrainingReview {
    return {
      id: view.id,
      userId: view.userId,
      date: view.date,
      effort: view.effort,
      note: view.note ?? null,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
    };
  }
}
