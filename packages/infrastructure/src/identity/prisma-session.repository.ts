import type { SessionRepository, StoredSession } from "@bb/application";
import type { Database } from "@/shared/database";

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly db: Database) {}

  async create(input: { userId: string; tokenHash: string; expiresAt: Date; userAgent: string | null }): Promise<StoredSession> {
    const row = await this.db.authSession.create({ data: input });
    return { id: row.id, userId: row.userId, expiresAt: row.expiresAt };
  }

  async findByTokenHash(tokenHash: string): Promise<StoredSession | null> {
    const row = await this.db.authSession.findUnique({ where: { tokenHash } });
    return row ? { id: row.id, userId: row.userId, expiresAt: row.expiresAt } : null;
  }

  async extend(id: string, expiresAt: Date): Promise<void> {
    await this.db.authSession.updateMany({ where: { id }, data: { expiresAt } });
  }

  async delete(id: string): Promise<void> {
    await this.db.authSession.deleteMany({ where: { id } });
  }

  async deleteForUser(userId: string): Promise<void> {
    await this.db.authSession.deleteMany({ where: { userId } });
  }

  async deleteExpired(now: Date): Promise<number> {
    return (await this.db.authSession.deleteMany({ where: { expiresAt: { lt: now } } })).count;
  }
}
