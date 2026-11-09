import { type Actor, BusinessRuleViolation, isCalendarDay, isObjectId, NotFound, type TrainingReview } from "@bb/domain";
import type { TrainingReviewRepository } from "./ports";

type Deps = { readonly reviews: TrainingReviewRepository };

/** One review per player per day: saving the same day again replaces it. */
export class SaveTrainingReview {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, input }: { actor: Actor; input: { date: string; effort: number; note?: string | null } }): Promise<TrainingReview> {
    if (!isCalendarDay(input.date)) throw new BusinessRuleViolation("The date must be YYYY-MM-DD.");
    if (!Number.isInteger(input.effort) || input.effort < 1 || input.effort > 10) {
      throw new BusinessRuleViolation("Effort is a whole number from 1 to 10.");
    }
    const note = input.note?.trim() || null;
    if (note && note.length > 1000) throw new BusinessRuleViolation("A note has at most 1000 characters.");
    return this.deps.reviews.upsert({ userId: actor.userId, date: input.date, effort: input.effort, note });
  }
}

export class ListMyTrainingReviews {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, from, to }: { actor: Actor; from?: string; to?: string }): Promise<TrainingReview[]> {
    for (const day of [from, to]) {
      if (day !== undefined && !isCalendarDay(day)) throw new BusinessRuleViolation("Dates must be YYYY-MM-DD.");
    }
    return this.deps.reviews.listByUser(actor.userId, { from, to });
  }
}

export class GetMyTrainingReview {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, date }: { actor: Actor; date: string }): Promise<TrainingReview | null> {
    if (!isCalendarDay(date)) return null;
    return this.deps.reviews.findByUserAndDate(actor.userId, date);
  }
}

/** Someone else's review answers NotFound, like a missing one. */
export class DeleteTrainingReview {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, reviewId }: { actor: Actor; reviewId: string }): Promise<void> {
    const review = isObjectId(reviewId) ? await this.deps.reviews.findById(reviewId) : null;
    if (!review || review.userId !== actor.userId) throw new NotFound("Review not found.");
    await this.deps.reviews.delete(reviewId);
  }
}
