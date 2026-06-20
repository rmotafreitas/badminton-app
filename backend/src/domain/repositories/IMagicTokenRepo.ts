import type { MagicToken } from "../entities/MagicToken";

export interface IMagicTokenRepo {
  create(
    target: string,
    type: "email" | "phone",
    token: string,
    expiresAt: Date,
  ): Promise<MagicToken>;
  findByToken(token: string): Promise<MagicToken | null>;
  markUsed(id: string): Promise<void>;
  deleteExpired(): Promise<void>;
}
