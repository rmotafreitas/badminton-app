import type { MagicToken } from "@/domain/entities/MagicToken";

type PrismaMagicTokenRecord = {
  id: string;
  token: string;
  target: string;
  type: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
};

export class MagicTokenMapper {
  static toDomain(record: PrismaMagicTokenRecord): MagicToken {
    return {
      id: record.id,
      token: record.token,
      target: record.target,
      type: record.type as "email" | "phone",
      expiresAt: record.expiresAt,
      used: record.used,
      createdAt: record.createdAt,
    };
  }
}
