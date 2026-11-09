import { z } from "zod";
import { CalendarDay, IdSchema, IsoDateTime } from "./common";

export const TrainingReviewSchema = z.object({
  id: IdSchema,
  date: CalendarDay,
  effort: z.number().int().min(1).max(10),
  note: z.string().nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type TrainingReview = z.infer<typeof TrainingReviewSchema>;
export const TrainingReviewListSchema = z.array(TrainingReviewSchema);

export const SaveTrainingReviewBodySchema = z.object({
  date: CalendarDay,
  effort: z.number().int().min(1).max(10),
  note: z.string().max(1000).nullable().optional(),
});
export const TrainingRangeQuerySchema = z.object({ from: CalendarDay.optional(), to: CalendarDay.optional() });

/** `GET /api/training-reviews/day/:date`: the review of that day, if any. */
export const TrainingDaySchema = z.object({ review: TrainingReviewSchema.nullable() });
