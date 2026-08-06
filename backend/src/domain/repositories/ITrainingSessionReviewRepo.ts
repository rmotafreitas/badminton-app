import type { TrainingSessionReview } from "../entities/TrainingSessionReview";

export interface CreateReviewParams {
  userId: string;
  date: string;
  effort: number;
  note?: string | null;
}

export interface ITrainingSessionReviewRepo {
  upsert(data: CreateReviewParams): Promise<TrainingSessionReview>;
  findByUserAndDate(userId: string, date: string): Promise<TrainingSessionReview | null>;
  findByUserId(userId: string, from?: string, to?: string): Promise<TrainingSessionReview[]>;
  findById(id: string): Promise<TrainingSessionReview | null>;
  delete(id: string): Promise<void>;
}
