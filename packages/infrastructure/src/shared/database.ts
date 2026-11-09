import { PrismaClient } from "@prisma/client";

export type Database = PrismaClient;

/** Readiness: a round trip to MongoDB. */
export const mongoHealth = (db: PrismaClient) => ({
  async database(): Promise<boolean> {
    try {
      await db.$runCommandRaw({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  },
});

/**
 * One client per process. On Vercel a warm function instance is reused between requests, so the module-level
 * client (and its connection pool) survives too.
 */
let shared: PrismaClient | undefined;
export function createDatabase(url: string): PrismaClient {
  shared ??= new PrismaClient({ datasourceUrl: url });
  return shared;
}
