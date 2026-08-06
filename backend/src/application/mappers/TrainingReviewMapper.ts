import type { TrainingSessionReview } from "@/domain/entities/TrainingSessionReview";
import type { TrainingReviewView } from "@/application/views/training-review.view";

export class TrainingReviewMapper {
  static toDomain(record: any): TrainingSessionReview {
    return {
      id: record.id,
      userId: record.userId,
      date: record.date,
      effort: record.effort,
      note: record.note ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  static toView(review: TrainingSessionReview): TrainingReviewView {
    return {
      id: review.id,
      userId: review.userId,
      date: review.date,
      effort: review.effort,
      note: review.note,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }
}
