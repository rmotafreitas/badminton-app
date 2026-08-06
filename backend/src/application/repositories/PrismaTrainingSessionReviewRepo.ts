import { PrismaClient } from "@prisma/client";
import type {
  ITrainingSessionReviewRepo,
  CreateReviewParams,
} from "@/domain/repositories/ITrainingSessionReviewRepo";
import type { TrainingSessionReview } from "@/domain/entities/TrainingSessionReview";
import { TrainingReviewMapper } from "@/application/mappers/TrainingReviewMapper";

export class PrismaTrainingSessionReviewRepo implements ITrainingSessionReviewRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(data: CreateReviewParams): Promise<TrainingSessionReview> {
    const existing = await this.prisma.trainingSessionReview.findFirst({
      where: { userId: data.userId, date: data.date },
    });

    if (existing) {
      const record = await this.prisma.trainingSessionReview.update({
        where: { id: existing.id },
        data: {
          effort: data.effort,
          note: data.note ?? null,
        },
      });
      return TrainingReviewMapper.toDomain(record);
    }

    const record = await this.prisma.trainingSessionReview.create({
      data: {
        userId: data.userId,
        date: data.date,
        effort: data.effort,
        note: data.note ?? null,
      },
    });
    return TrainingReviewMapper.toDomain(record);
  }

  async findByUserAndDate(userId: string, date: string): Promise<TrainingSessionReview | null> {
    const record = await this.prisma.trainingSessionReview.findFirst({
      where: { userId, date },
    });
    return record ? TrainingReviewMapper.toDomain(record) : null;
  }

  async findByUserId(userId: string, from?: string, to?: string): Promise<TrainingSessionReview[]> {
    const where: any = { userId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = from;
      if (to) where.date.lte = to;
    }
    const records = await this.prisma.trainingSessionReview.findMany({
      where,
      orderBy: { date: "desc" },
    });
    return records.map(TrainingReviewMapper.toDomain);
  }

  async findById(id: string): Promise<TrainingSessionReview | null> {
    const record = await this.prisma.trainingSessionReview.findUnique({ where: { id } });
    return record ? TrainingReviewMapper.toDomain(record) : null;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.trainingSessionReview.delete({ where: { id } });
  }
}
