import type { TrainingReviewRepository } from "@bb/application";
import { isObjectId, type TrainingReview } from "@bb/domain";
import type { TrainingSessionReview } from "@prisma/client";
import type { Database } from "@/shared/database";

const toReview = (r: TrainingSessionReview): TrainingReview => ({
  id: r.id,
  userId: r.userId,
  date: r.date,
  effort: r.effort,
  note: r.note,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export class PrismaTrainingReviewRepository implements TrainingReviewRepository {
  constructor(private readonly db: Database) {}

  async upsert(input: { userId: string; date: string; effort: number; note: string | null }): Promise<TrainingReview> {
    const existing = await this.db.trainingSessionReview.findFirst({ where: { userId: input.userId, date: input.date } });
    const row = existing
      ? await this.db.trainingSessionReview.update({ where: { id: existing.id }, data: { effort: input.effort, note: input.note } })
      : await this.db.trainingSessionReview.create({ data: input });
    return toReview(row);
  }

  async findById(id: string): Promise<TrainingReview | null> {
    if (!isObjectId(id)) return null;
    const row = await this.db.trainingSessionReview.findUnique({ where: { id } });
    return row ? toReview(row) : null;
  }

  async findByUserAndDate(userId: string, date: string): Promise<TrainingReview | null> {
    const row = await this.db.trainingSessionReview.findFirst({ where: { userId, date } });
    return row ? toReview(row) : null;
  }

  async listByUser(userId: string, range: { from?: string; to?: string }): Promise<TrainingReview[]> {
    const rows = await this.db.trainingSessionReview.findMany({
      where: {
        userId,
        ...((range.from || range.to) && { date: { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) } }),
      },
      orderBy: { date: "desc" },
    });
    return rows.map(toReview);
  }

  async delete(id: string): Promise<void> {
    await this.db.trainingSessionReview.delete({ where: { id } });
  }
}
