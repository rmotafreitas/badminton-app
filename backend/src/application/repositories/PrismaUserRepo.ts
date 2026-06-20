import { PrismaClient } from "@prisma/client";
import type {
  IUserRepo,
  CreateUserParams,
} from "@/domain/repositories/IUserRepo";
import type { User, AuthProvider } from "@/domain/entities/User";
import { UserMapper } from "@/application/mappers/UserMapper";

export class PrismaUserRepo implements IUserRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { id } });
    return record ? UserMapper.toDomain(record) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const record = await this.prisma.user.findFirst({ where: { email } });
    return record ? UserMapper.toDomain(record) : null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    const record = await this.prisma.user.findFirst({ where: { phone } });
    return record ? UserMapper.toDomain(record) : null;
  }

  async findByAuthMethod(
    provider: AuthProvider,
    providerId: string,
  ): Promise<User | null> {
    const method = await this.prisma.authMethod.findUnique({
      where: { provider_providerId: { provider, providerId } },
      include: { user: true },
    });
    return method ? UserMapper.toDomain(method.user) : null;
  }

  async createUserWithAuthMethod(params: CreateUserParams): Promise<User> {
    const record = await this.prisma.user.create({
      data: {
        email: params.email ?? null,
        phone: params.phone ?? null,
        passwordHash: params.passwordHash ?? null,
        authMethods: {
          create: {
            provider: params.provider,
            providerId: params.providerId,
          },
        },
        profile: {
          create: {
            name: params.name ?? "",
          },
        },
      },
    });
    return UserMapper.toDomain(record);
  }

  async setPasswordHash(userId: string, hash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash },
    });
  }

  async linkAuthMethod(
    userId: string,
    provider: AuthProvider,
    providerId: string,
  ): Promise<void> {
    await this.prisma.authMethod.create({
      data: { userId, provider, providerId },
    });
  }

  async assignClub(userId: string, clubId: string): Promise<User> {
    const record = await this.prisma.user.update({
      where: { id: userId },
      data: { clubId },
    });
    return UserMapper.toDomain(record);
  }

  async findByIds(ids: string[]): Promise<User[]> {
    const records = await this.prisma.user.findMany({
      where: { id: { in: ids } },
    });
    return records.map(UserMapper.toDomain);
  }

  async updateElo(userId: string, elo: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { elo },
    });
  }

  async findAll(): Promise<User[]> {
    const records = await this.prisma.user.findMany({
      include: { profile: { select: { name: true, photo: true } } },
    });
    return records.map(UserMapper.toDomain);
  }
}
