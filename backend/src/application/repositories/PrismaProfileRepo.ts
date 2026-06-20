import { PrismaClient } from "@prisma/client";
import type { IProfileRepo } from "@/domain/repositories/IProfileRepo";
import type { Profile } from "@/domain/entities/Profile";
import { ProfileMapper } from "@/application/mappers/ProfileMapper";

export class PrismaProfileRepo implements IProfileRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserId(userId: string): Promise<Profile | null> {
    const record = await this.prisma.profile.findUnique({
      where: { userId },
    });
    return record ? ProfileMapper.toDomain(record) : null;
  }

  async updateByUserId(
    userId: string,
    data: Partial<Profile>,
  ): Promise<Profile> {
    const record = await this.prisma.profile.update({
      where: { userId },
      data,
    });
    return ProfileMapper.toDomain(record);
  }
}
