import { PrismaClient } from "@prisma/client";
import type { IClubRepo } from "@/domain/repositories/IClubRepo";
import type { Club } from "@/domain/entities/Club";
import { ClubMapper } from "@/application/mappers/ClubMapper";

export class PrismaClubRepo implements IClubRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    name: string;
    location?: string;
    profilePicture?: string;
    banner?: string;
  }): Promise<Club> {
    const record = await this.prisma.club.create({ data });
    return ClubMapper.toDomain(record);
  }

  async update(id: string, data: Partial<Club>): Promise<Club> {
    const { users, ...updateData } = data;
    const record = await this.prisma.club.update({
      where: { id },
      data: updateData,
    });
    return ClubMapper.toDomain(record);
  }

  async findById(id: string): Promise<Club | null> {
    const record = await this.prisma.club.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            roles: true,
            createdAt: true,
            profile: { select: { name: true, photo: true } },
          },
        },
      },
    });
    return record ? ClubMapper.toDomain(record) : null;
  }

  async findAll(): Promise<Club[]> {
    const records = await this.prisma.club.findMany();
    return records.map(ClubMapper.toDomain);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.club.delete({ where: { id } });
  }
}
