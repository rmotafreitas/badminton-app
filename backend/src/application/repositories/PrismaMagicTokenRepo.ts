import { PrismaClient } from "@prisma/client";
import type { IMagicTokenRepo } from "@/domain/repositories/IMagicTokenRepo";
import type { MagicToken } from "@/domain/entities/MagicToken";
import { MagicTokenMapper } from "@/application/mappers/MagicTokenMapper";

export class PrismaMagicTokenRepo implements IMagicTokenRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    target: string,
    type: "email" | "phone",
    token: string,
    expiresAt: Date,
  ): Promise<MagicToken> {
    const record = await this.prisma.magicToken.create({
      data: { target, type, token, expiresAt },
    });
    return MagicTokenMapper.toDomain(record);
  }

  async findByToken(token: string): Promise<MagicToken | null> {
    const record = await this.prisma.magicToken.findUnique({
      where: { token },
    });
    return record ? MagicTokenMapper.toDomain(record) : null;
  }

  async markUsed(id: string): Promise<void> {
    await this.prisma.magicToken.update({
      where: { id },
      data: { used: true },
    });
  }

  async deleteExpired(): Promise<void> {
    await this.prisma.magicToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }
}
