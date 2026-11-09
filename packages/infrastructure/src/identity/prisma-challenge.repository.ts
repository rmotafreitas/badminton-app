import type { ChallengeKind, SignInChallenge, SignInChallengeRepository } from "@bb/application";
import type { Database } from "@/shared/database";

export class PrismaChallengeRepository implements SignInChallengeRepository {
  constructor(private readonly db: Database) {}

  async create(input: { kind: ChallengeKind; target: string; secretHash: string; expiresAt: Date }): Promise<void> {
    await this.db.magicToken.create({
      data: { type: input.kind, target: input.target, token: input.secretHash, expiresAt: input.expiresAt },
    });
  }

  async findBySecretHash(secretHash: string): Promise<SignInChallenge | null> {
    const row = await this.db.magicToken.findUnique({ where: { token: secretHash } });
    if (!row) return null;
    return { id: row.id, kind: row.type as ChallengeKind, target: row.target, expiresAt: row.expiresAt, used: row.used };
  }

  /** Compare-and-set: only one concurrent redeem can flip `used`. */
  async consume(id: string): Promise<boolean> {
    const { count } = await this.db.magicToken.updateMany({ where: { id, used: false }, data: { used: true } });
    return count === 1;
  }

  async deleteExpired(now: Date): Promise<number> {
    return (await this.db.magicToken.deleteMany({ where: { expiresAt: { lt: now } } })).count;
  }
}
