import { existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { E2E, PEOPLE } from "./env";

/** Fresh database, schema indexes, a club with people, an empty mailbox, and fixture files. */
export default async function globalSetup() {
  const db = new PrismaClient({ datasourceUrl: E2E.databaseUrl });
  await db.$runCommandRaw({ dropDatabase: 1 });
  execFileSync("bunx", ["prisma", "db", "push", "--skip-generate", "--schema", "../packages/infrastructure/prisma/schema.prisma"], {
    env: { ...process.env, DATABASE_URL: E2E.databaseUrl },
    stdio: "ignore",
  });

  const passwordHash = await bcrypt.hash(E2E.password, 10);
  const club = await db.club.create({ data: { name: "Clube E2E", location: "Porto" } });
  const person = (p: { email: string; name: string; phone?: string }, roles: ("SYSTEM_ADMIN" | "CLUB_ADMIN" | "COACH" | "PLAYER")[], clubId: string | null) =>
    db.user.create({
      data: {
        email: p.email,
        phone: p.phone ?? null,
        passwordHash,
        roles,
        clubId,
        authMethods: { create: { provider: "password", providerId: p.email } },
        profile: { create: { name: p.name } },
      },
    });
  await person(PEOPLE.admin, ["SYSTEM_ADMIN"], null);
  await person(PEOPLE.coach, ["COACH", "PLAYER"], club.id);
  await person(PEOPLE.ana, ["PLAYER"], club.id);
  await person(PEOPLE.bruno, ["PLAYER"], club.id);
  await person(PEOPLE.rui, ["PLAYER"], club.id);
  await person(PEOPLE.clara, ["CLUB_ADMIN", "PLAYER"], club.id);
  await db.$disconnect();

  mkdirSync(".fixtures", { recursive: true });
  // Rally Analysis: an 8-second cut of the lab sample. Without a GPU the models run on WASM, so the full clip takes
  // ~40 minutes in CI; 8 s still holds a rally. RALLY_VIDEO picks another clip.
  const sample = "../apps/web/public/lab/sample.mp4";
  if (existsSync(sample) && !existsSync(".fixtures/rally-short.mp4")) {
    try {
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", sample, "-t", "8", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", ".fixtures/rally-short.mp4"]);
    } catch {
      // no ffmpeg: the rally spec falls back to the full sample
    }
  }
  await sharp({ create: { width: 640, height: 640, channels: 3, background: "#16a34a" } })
    .composite([{ input: Buffer.from('<svg width="640" height="640"><circle cx="320" cy="320" r="200" fill="#fde68a"/></svg>') }])
    .png()
    .toFile(".fixtures/avatar.png");
}
