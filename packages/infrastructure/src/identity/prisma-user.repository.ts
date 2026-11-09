import { type CreateUserInput, normalizePhone, type UserRepository } from "@bb/application";
import { type AuthProvider, isObjectId, type Role, type User } from "@bb/domain";
import type { Database } from "@/shared/database";
import { toUser, userWithProfile } from "./user-rows";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<User | null> {
    if (!isObjectId(id)) return null;
    const row = await this.db.user.findUnique({ where: { id }, ...userWithProfile });
    return row ? toUser(row) : null;
  }

  async findByIds(ids: readonly string[]): Promise<User[]> {
    const valid = [...new Set(ids)].filter(isObjectId);
    if (valid.length === 0) return [];
    const rows = await this.db.user.findMany({ where: { id: { in: valid } }, ...userWithProfile });
    return rows.map(toUser);
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db.user.findFirst({ where: { email }, ...userWithProfile });
    return row ? toUser(row) : null;
  }

  /** Stored phones are normalised on write; legacy rows with spaces are matched by their canonical form. */
  async findByPhone(phone: string): Promise<User | null> {
    const exact = await this.db.user.findFirst({ where: { phone }, ...userWithProfile });
    if (exact) return toUser(exact);
    const candidates = await this.db.user.findMany({ where: { phone: { not: null } }, ...userWithProfile });
    const match = candidates.find((c) => normalizePhone(c.phone) === phone);
    return match ? toUser(match) : null;
  }

  async findByAuthMethod(provider: AuthProvider, providerId: string): Promise<User | null> {
    const method = await this.db.authMethod.findUnique({
      where: { provider_providerId: { provider, providerId } },
      include: { user: userWithProfile },
    });
    return method ? toUser(method.user) : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const row = await this.db.user.create({
      data: {
        email: input.email ?? null,
        phone: input.phone ?? null,
        authMethods: { create: { provider: input.provider, providerId: input.providerId } },
        profile: { create: { name: input.name ?? "" } },
      },
      ...userWithProfile,
    });
    return toUser(row);
  }

  async linkAuthMethod(userId: string, provider: AuthProvider, providerId: string): Promise<void> {
    await this.db.authMethod.upsert({
      where: { provider_providerId: { provider, providerId } },
      create: { userId, provider, providerId },
      update: {},
    });
  }

  async setClub(userId: string, clubId: string | null): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { clubId } });
  }

  async clearClub(clubId: string): Promise<void> {
    await this.db.user.updateMany({ where: { clubId }, data: { clubId: null } });
  }

  async listAll(): Promise<User[]> {
    const rows = await this.db.user.findMany({ ...userWithProfile, orderBy: { createdAt: "asc" } });
    return rows.map(toUser);
  }

  async setRoles(userId: string, roles: readonly Role[]): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { roles: [...roles] } });
  }

  async setRatings(updates: readonly { userId: string; eloSingles?: number; eloDoubles?: number }[]): Promise<void> {
    const writes = updates
      .filter((u) => isObjectId(u.userId) && (u.eloSingles !== undefined || u.eloDoubles !== undefined))
      .map((u) =>
        this.db.user.updateMany({
          where: { id: u.userId },
          data: {
            ...(u.eloSingles !== undefined && { eloSingles: u.eloSingles }),
            ...(u.eloDoubles !== undefined && { eloDoubles: u.eloDoubles }),
          },
        }),
      );
    if (writes.length) await this.db.$transaction(writes);
  }
}
