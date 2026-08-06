export interface TrainingReview {
  id: string;
  userId: string;
  date: string;
  effort: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertTrainingReviewParams {
  date: string;
  effort: number;
  note?: string | null;
}
