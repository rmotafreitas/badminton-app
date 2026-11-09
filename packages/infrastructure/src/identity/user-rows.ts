import { DEFAULT_RATING, type Role, type User } from "@bb/domain";
import type { Prisma } from "@prisma/client";

export const userWithProfile = {
  include: { profile: { select: { name: true, photoVersion: true } } },
} satisfies Prisma.UserDefaultArgs;

type UserRow = Prisma.UserGetPayload<typeof userWithProfile>;

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    passwordHash: row.passwordHash,
    roles: row.roles as Role[],
    eloSingles: row.eloSingles ?? DEFAULT_RATING,
    eloDoubles: row.eloDoubles ?? DEFAULT_RATING,
    isActive: row.isActive,
    clubId: row.clubId,
    createdAt: row.createdAt,
    lastAccess: row.lastAccess,
    name: row.profile?.name || null,
    photoVersion: row.profile?.photoVersion ?? null,
  };
}
