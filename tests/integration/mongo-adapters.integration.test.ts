import { beforeAll, describe, expect, it } from "bun:test";
import {
  MongoRateLimiter,
  PrismaChallengeRepository,
  PrismaClubRepository,
  PrismaGameRepository,
  PrismaPlayerDirectory,
  PrismaProfileRepository,
  PrismaSessionRepository,
  PrismaTrainingReviewRepository,
  PrismaUserRepository,
} from "@bb/infrastructure";
import type { PrismaClient } from "@prisma/client";
import { useIsolatedDatabase } from "./support";

const isolated = useIsolatedDatabase();
let db: PrismaClient;
beforeAll(() => {
  db = isolated.db;
});

describe("PrismaUserRepository", () => {
  it("creates a user with its sign-in method and profile, and finds it every way", async () => {
    const users = new PrismaUserRepository(db);
    const created = await users.create({ email: "ana@test.pt", name: "Ana", provider: "email-code", providerId: "ana@test.pt" });
    expect(created).toMatchObject({ email: "ana@test.pt", name: "Ana", roles: ["PLAYER"], eloSingles: 200, isActive: true });
    expect((await users.findByEmail("ana@test.pt"))?.id).toBe(created.id);
    expect((await users.findByAuthMethod("email-code", "ana@test.pt"))?.id).toBe(created.id);
    expect(await users.findById("not-an-id")).toBeNull();
    // Linking the same method twice is harmless (unique index, upsert).
    await users.linkAuthMethod(created.id, "google", "g-1");
    await users.linkAuthMethod(created.id, "google", "g-1");
    expect((await users.findByAuthMethod("google", "g-1"))?.id).toBe(created.id);
  });

  it("finds legacy phones stored with spaces by their canonical form", async () => {
    const users = new PrismaUserRepository(db);
    const row = await db.user.create({ data: { phone: "+351 967 000 111", profile: { create: { name: "Legacy" } } } });
    expect((await users.findByPhone("+351967000111"))?.id).toBe(row.id);
  });

  it("writes many ratings in one transaction and ignores unknown ids", async () => {
    const users = new PrismaUserRepository(db);
    const a = await users.create({ name: "A", provider: "password", providerId: "a" });
    const b = await users.create({ name: "B", provider: "password", providerId: "b" });
    await users.setRatings([
      { userId: a.id, eloSingles: 216 },
      { userId: b.id, eloSingles: 184, eloDoubles: 190 },
      { userId: "65f0000000000000000000ff", eloSingles: 1 },
    ]);
    expect((await users.findByIds([a.id, b.id])).map((u) => [u.eloSingles, u.eloDoubles]).sort()).toEqual([
      [184, 190],
      [216, 200],
    ]);
  });
});

describe("sessions and sign-in challenges", () => {
  it("stores sessions by token hash, extends and expires them", async () => {
    const sessions = new PrismaSessionRepository(db);
    const user = await new PrismaUserRepository(db).create({ name: "S", provider: "password", providerId: "s" });
    const past = new Date(Date.now() - 1000);
    const s1 = await sessions.create({ userId: user.id, tokenHash: "hash-1", expiresAt: new Date(Date.now() + 60_000), userAgent: "ua" });
    await sessions.create({ userId: user.id, tokenHash: "hash-2", expiresAt: past, userAgent: null });
    await expect(sessions.create({ userId: user.id, tokenHash: "hash-1", expiresAt: past, userAgent: null })).rejects.toThrow();
    const later = new Date(Date.now() + 3_600_000);
    await sessions.extend(s1.id, later);
    expect((await sessions.findByTokenHash("hash-1"))?.expiresAt.getTime()).toBe(later.getTime());
    expect(await sessions.deleteExpired(new Date())).toBe(1);
    expect(await sessions.findByTokenHash("hash-2")).toBeNull();
  });

  it("a code is consumed exactly once, even by concurrent redeems", async () => {
    const challenges = new PrismaChallengeRepository(db);
    await challenges.create({ kind: "email-code", target: "c@test.pt", secretHash: "secret-hash", expiresAt: new Date(Date.now() + 60_000) });
    const found = await challenges.findBySecretHash("secret-hash");
    const results = await Promise.all(Array.from({ length: 5 }, () => challenges.consume(found!.id)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await challenges.findBySecretHash("secret-hash"))?.used).toBe(true);
  });
});

describe("MongoRateLimiter", () => {
  it("counts concurrent hits atomically and resets per window", async () => {
    let now = new Date("2026-11-06T10:00:00Z");
    const limiter = new MongoRateLimiter(db, () => now);
    const results = await Promise.all(Array.from({ length: 8 }, () => limiter.hit("k", 60, 5)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(results.find((r) => !r.allowed)?.retryAfterSeconds).toBeGreaterThan(0);
    now = new Date("2026-11-06T10:01:01Z");
    expect((await limiter.hit("k", 60, 5)).allowed).toBe(true);
    await limiter.refund("k", 60);
    expect((await db.rateLimitBucket.findFirst({ where: { key: "k", windowStart: new Date("2026-11-06T10:01:00Z") } }))?.count).toBe(0);
    expect(await limiter.purgeExpired(new Date("2026-11-06T10:05:00Z"))).toBe(2);
  });
});

describe("clubs, games, players", () => {
  it("never loads image data with a club, serves it on request, and versions it", async () => {
    const clubs = new PrismaClubRepository(db);
    const club = await clubs.create({ name: "CFBG", location: null });
    await clubs.setImage(club.id, "picture", { dataUrl: "data:image/webp;base64,AAAA", version: "v1abcdef" });
    const detail = await clubs.findWithMembers(club.id);
    expect(detail).toMatchObject({ pictureVersion: "v1abcdef", members: [] });
    expect(JSON.stringify(detail)).not.toContain("AAAA");
    expect(await clubs.getImage(club.id, "picture")).toBe("data:image/webp;base64,AAAA");
    await clubs.setImage(club.id, "picture", null);
    expect((await clubs.findById(club.id))?.pictureVersion).toBeNull();
  });

  it("lists games newest first, finds shared games, and resolves players in one query", async () => {
    const users = new PrismaUserRepository(db);
    const club = await new PrismaClubRepository(db).create({ name: "G", location: null });
    const [a, b, c] = await Promise.all(["A", "B", "C"].map((n) => users.create({ name: n, provider: "password", providerId: `g-${n}` })));
    const games = new PrismaGameRepository(db);
    const day = (d: number) => new Date(`2026-10-${String(d).padStart(2, "0")}T10:00:00Z`);
    const base = { type: "SINGLES" as const, clubId: club.id, sets: [{ team1Score: 21, team2Score: 10 }], registeredById: a!.id };
    await games.create({ ...base, team1PlayerIds: [a!.id], team2PlayerIds: [b!.id], playedAt: day(1) });
    await games.create({ ...base, team1PlayerIds: [c!.id], team2PlayerIds: [a!.id], playedAt: day(3) });
    await games.create({ ...base, team1PlayerIds: [b!.id], team2PlayerIds: [c!.id], playedAt: day(2) });
    expect((await games.listByClub(club.id, 10)).map((g) => g.playedAt.getUTCDate())).toEqual([3, 2, 1]);
    expect((await games.listAllByClub(club.id)).map((g) => g.playedAt.getUTCDate())).toEqual([1, 2, 3]);
    expect(await games.listByPlayer(a!.id)).toHaveLength(2);
    expect(await games.listShared(a!.id, b!.id)).toHaveLength(1);
    expect((await new PrismaClubRepository(db).countGames(club.id))).toBe(3);
    const players = await new PrismaPlayerDirectory(db).findPlayers([a!.id, b!.id, "nope"]);
    expect(players.map((p) => p.name).sort()).toEqual(["A", "B"]);
  });
});

describe("profiles and training", () => {
  it("joins the profile with the account and keeps images out of reads", async () => {
    const user = await new PrismaUserRepository(db).create({ email: "p@test.pt", name: "Pat", provider: "password", providerId: "p" });
    const profiles = new PrismaProfileRepository(db);
    await profiles.update(user.id, { bio: "Lefty", birthday: new Date("1990-01-02") });
    await profiles.setImage(user.id, "photo", { dataUrl: "data:image/webp;base64,BBBB", version: "ph123456" });
    const player = await profiles.findPlayer(user.id);
    expect(player).toMatchObject({ name: "Pat", bio: "Lefty", email: "p@test.pt", photoVersion: "ph123456", eloSingles: 200 });
    expect(JSON.stringify(player)).not.toContain("BBBB");
  });

  it("one review per day, filtered by an inclusive range", async () => {
    const user = await new PrismaUserRepository(db).create({ name: "T", provider: "password", providerId: "t" });
    const reviews = new PrismaTrainingReviewRepository(db);
    await reviews.upsert({ userId: user.id, date: "2026-11-01", effort: 3, note: null });
    const again = await reviews.upsert({ userId: user.id, date: "2026-11-01", effort: 8, note: "hard" });
    await reviews.upsert({ userId: user.id, date: "2026-11-05", effort: 5, note: null });
    expect(again.effort).toBe(8);
    expect((await reviews.listByUser(user.id, {})).map((r) => r.date)).toEqual(["2026-11-05", "2026-11-01"]);
    expect(await reviews.listByUser(user.id, { from: "2026-11-02", to: "2026-11-05" })).toHaveLength(1);
  });
});
