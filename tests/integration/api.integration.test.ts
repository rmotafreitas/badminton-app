import { beforeAll, describe, expect, it } from "bun:test";
import { buildApp } from "@bb/api/src/app";
import { createInfrastructure, createModules } from "@bb/bootstrap";
import { loadConfig } from "@bb/config";
import { hashPassword } from "@bb/infrastructure";
import type { PrismaClient } from "@prisma/client";
import { useIsolatedDatabase } from "./support";

const ORIGIN = "https://app.badminton.test";
let db: PrismaClient;
let app: ReturnType<typeof buildApp>;

/** The production wiring (real adapters, real MongoDB) behind the real HTTP layer. */
const isolated = useIsolatedDatabase();
beforeAll(async () => {
  db = isolated.db;
  const config = loadConfig({ DATABASE_URL: isolated.url, APP_URL: ORIGIN, NODE_ENV: "test" });
  const logs: unknown[] = [];
  const infra = createInfrastructure(config, {
    // A client of its own: the module-level shared client may point at another database.
    ...(await import("@bb/infrastructure").then(({ PrismaUserRepository, PrismaSessionRepository, PrismaChallengeRepository, PrismaClubRepository, PrismaGameRepository, PrismaPlayerDirectory, PrismaProfileRepository, PrismaTrainingReviewRepository, PrismaRallySessionRepository, MongoRateLimiter, mongoHealth }) => ({
      users: new PrismaUserRepository(db),
      sessions: new PrismaSessionRepository(db),
      challenges: new PrismaChallengeRepository(db),
      clubs: new PrismaClubRepository(db),
      games: new PrismaGameRepository(db),
      players: new PrismaPlayerDirectory(db),
      profiles: new PrismaProfileRepository(db),
      reviews: new PrismaTrainingReviewRepository(db),
      rally: new PrismaRallySessionRepository(db),
      limiter: new MongoRateLimiter(db),
      health: mongoHealth(db),
    }))),
    logger: { info: () => {}, warn: () => {}, error: (m: string, f?: unknown) => void logs.push([m, f]) },
  });
  const modules = createModules(infra, { appOrigin: ORIGIN, registrationOpen: false });
  app = buildApp({ ...modules, clock: infra.clock, log: infra.logger, appOrigin: ORIGIN, cronSecret: "it-cron" });
}, 60_000);

const call = (path: string, init: RequestInit & { cookie?: string } = {}) =>
  app.handle(
    new Request(`https://api.badminton.test${path}`, {
      ...init,
      headers: { origin: ORIGIN, "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}), ...init.headers },
    }),
  );

describe("API over real MongoDB", () => {
  it("is ready when the database answers", async () => {
    expect(await (await call("/api/health/ready")).json()).toEqual({ ready: true, checks: { database: true } });
  });

  it("password sign-in → session cookie → register a game → ratings persisted → sign-out", async () => {
    const club = await db.club.create({ data: { name: "IT Club" } });
    const passwordHash = await hashPassword("secret-pw");
    const me = await db.user.create({
      data: { email: "me@test.pt", passwordHash, clubId: club.id, profile: { create: { name: "Me" } } },
    });
    const rival = await db.user.create({ data: { clubId: club.id, profile: { create: { name: "Rival" } } } });

    const signIn = await call("/api/auth/sign-in/complete", {
      method: "POST",
      body: JSON.stringify({ provider: "password", identifier: "ME@test.pt", password: "secret-pw" }),
    });
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.getSetCookie().find((c) => c.startsWith("__Host-bb_session="))!.split(";")[0]!;
    expect(await db.authSession.count({ where: { userId: me.id } })).toBe(1);

    const game = await call("/api/games", {
      method: "POST",
      cookie,
      body: JSON.stringify({ clubId: club.id, type: "SINGLES", team1PlayerIds: [me.id], team2PlayerIds: [rival.id], team1Points: 21, team2Points: 12 }),
    });
    expect(game.status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: me.id } })).eloSingles).toBe(216);

    const session = (await (await call("/api/auth/session", { cookie })).json()) as { user: { eloSingles: number; name: string } };
    expect(session.user).toMatchObject({ eloSingles: 216, name: "Me" });

    expect((await call("/api/auth/sign-out", { method: "POST", cookie })).status).toBe(204);
    expect(await db.authSession.count({ where: { userId: me.id } })).toBe(0);
    expect((await call("/api/games/mine", { cookie })).status).toBe(401);
  });

  it("with registration closed, an unknown address gets no code", async () => {
    const res = await call("/api/auth/sign-in/start", { method: "POST", body: JSON.stringify({ provider: "email-code", email: "stranger@test.pt" }) });
    expect(res.status).toBe(403);
    expect(await db.magicToken.count()).toBe(0);
  });
});

describe("daily maintenance over real MongoDB", () => {
  it("deletes expired sessions, codes and rate-limit windows, keeps live ones", async () => {
    const user = await db.user.create({ data: { profile: { create: { name: "Old" } } } });
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    await db.authSession.createMany({
      data: [
        { userId: user.id, tokenHash: "expired-1", expiresAt: past },
        { userId: user.id, tokenHash: "live-1", expiresAt: future },
      ],
    });
    await db.magicToken.create({ data: { token: "old-code", target: "x@test.pt", type: "email-code", expiresAt: past } });
    await db.rateLimitBucket.create({ data: { key: "k", windowStart: past, count: 3, expiresAt: past } });
    const res = await call("/api/maintenance/daily", { headers: { authorization: "Bearer it-cron" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sessions: 1, challenges: 1, rateLimits: 1, videos: 0 });
    expect(await db.authSession.findMany({ select: { tokenHash: true } })).toContainEqual({ tokenHash: "live-1" });
  });
});
