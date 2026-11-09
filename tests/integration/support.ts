import { afterAll, beforeAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { $ } from "bun";

/** Base URL of the test MongoDB (a replica set: Prisma needs one for transactions). */
const BASE = process.env.TEST_DATABASE_URL ?? "mongodb://localhost:27017/?replicaSet=rs0&directConnection=true";
const SCHEMA = new URL("../../packages/infrastructure/prisma/schema.prisma", import.meta.url).pathname;

export function databaseUrl(name: string): string {
  const url = new URL(BASE);
  url.pathname = `/${name}`;
  return url.toString();
}

/**
 * A fresh database per test file: the schema's indexes are pushed (unique constraints matter for the adapters), and the
 * database is dropped after the file. Call at the top level of the file; read `.db` / `.url` inside tests.
 */
export function useIsolatedDatabase() {
  const handle = {} as { db: PrismaClient; url: string };
  beforeAll(async () => {
    const name = `bb_it_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    handle.url = databaseUrl(name);
    await $`bunx prisma db push --skip-generate --schema ${SCHEMA}`.env({ ...process.env, DATABASE_URL: handle.url }).quiet();
    handle.db = new PrismaClient({ datasourceUrl: handle.url });
  }, 60_000);
  afterAll(async () => {
    await handle.db?.$runCommandRaw({ dropDatabase: 1 });
    await handle.db?.$disconnect();
  });
  return handle;
}

export const objectId = () => Array.from({ length: 24 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
