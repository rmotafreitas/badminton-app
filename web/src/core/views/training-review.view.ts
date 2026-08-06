export interface TrainingReviewView {
  id: string;
  userId: string;
  date: string;
  effort: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}
