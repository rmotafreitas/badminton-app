import { beforeAll, describe, expect, it } from "bun:test";
import { PrismaGameRepository, PrismaRecordStore, PrismaUserRepository } from "@bb/infrastructure";
import type { PrismaClient } from "@prisma/client";
import { useIsolatedDatabase } from "./support";

const isolated = useIsolatedDatabase();
let db: PrismaClient;
let store: PrismaRecordStore;
beforeAll(() => {
  db = isolated.db;
  store = new PrismaRecordStore(db);
});

const query = (overrides: object = {}) => ({ where: {}, sort: { field: "createdAt", dir: "asc" as const }, skip: 0, take: 50, ...overrides });

describe("PrismaRecordStore", () => {
  it("lists users with profile fields, searches and sorts through the profile, and filters roles", async () => {
    const club = await db.club.create({ data: { name: "CFBG" } });
    const users = new PrismaUserRepository(db);
    await users.createInvited({ email: "zoe@test.pt", name: "Zoe", roles: ["PLAYER"], clubId: club.id });
    await users.createInvited({ email: "ana@test.pt", name: "Ana", roles: ["COACH", "PLAYER"], clubId: club.id });
    await users.createInvited({ phone: "+351910000000", name: "Outsider", roles: ["PLAYER"], clubId: null });
    await db.user.updateMany({ data: { passwordHash: "secret-hash" } });

    const byName = await store.list("users", query({ where: { clubId: club.id }, sort: { field: "name", dir: "asc" } }));
    expect(byName.total).toBe(2);
    expect(byName.rows.map((r) => r.values.name)).toEqual(["Ana", "Zoe"]);
    expect(JSON.stringify(byName.rows)).not.toContain("secret-hash");

    const search = await store.list("users", query({ search: { term: "ZO", fields: ["name", "email", "phone"] } }));
    expect(search.rows.map((r) => r.values.email)).toEqual(["zoe@test.pt"]);
    const byPhone = await store.list("users", query({ search: { term: "+35191", fields: ["name", "email", "phone"] } }));
    expect(byPhone.rows.map((r) => r.values.name)).toEqual(["Outsider"]);
    // The term is text, not a regex (Prisma doesn't escape it on MongoDB).
    expect((await store.list("users", query({ search: { term: ".*", fields: ["name", "email"] } }))).total).toBe(0);

    const coaches = await store.list("users", query({ where: { roles: "COACH" } }));
    expect(coaches.rows.map((r) => r.values.name)).toEqual(["Ana"]);

    const paged = await store.list("users", query({ sort: { field: "name", dir: "desc" }, skip: 1, take: 1 }));
    expect(paged.rows.map((r) => r.values.name)).toEqual(["Outsider"]);
    expect(paged.total).toBe(3);

    const labels = await store.labels("users", byName.rows.map((r) => r.id));
    expect([...labels.values()].sort()).toEqual(["Ana", "Zoe"]);
  });

  it("maps club image versions and gets rows by id", async () => {
    const club = await db.club.create({ data: { name: "Pics", pictureVersion: "abc123", bannerVersion: null } });
    const row = await store.get("clubs", club.id);
    expect(row?.values).toMatchObject({ name: "Pics", picture: "abc123", banner: null });
    expect(await store.get("clubs", "nope")).toBeNull();
  });

  it("filters games by a player in a team (refs) and never returns session token hashes", async () => {
    const club = await db.club.create({ data: { name: "G" } });
    const [a, b] = await Promise.all(["a", "b"].map((n) => db.user.create({ data: { email: `${n}@g.pt` } })));
    await new PrismaGameRepository(db).create({
      type: "SINGLES",
      clubId: club.id,
      team1PlayerIds: [a!.id],
      team2PlayerIds: [b!.id],
      sets: [{ team1Score: 21, team2Score: 10 }],
      registeredById: a!.id,
      playedAt: new Date("2026-11-01T10:00:00Z"),
    });
    const games = await store.list("games", query({ where: { team1PlayerIds: a!.id }, sort: { field: "playedAt", dir: "desc" } }));
    expect(games.rows[0]?.values.sets).toEqual([{ team1Score: 21, team2Score: 10 }]);
    expect((await store.labels("games", [games.rows[0]!.id])).get(games.rows[0]!.id)).toBe("2026-11-01 · singles");

    await db.authSession.create({ data: { userId: a!.id, tokenHash: "very-secret", expiresAt: new Date(Date.now() + 1e6) } });
    expect(JSON.stringify(await store.list("authSessions", query()))).not.toContain("very-secret");
  });

  it("removes sign-in codes and rate-limit windows (missing ids are fine)", async () => {
    const code = await db.magicToken.create({ data: { token: "h", target: "x@t.pt", type: "email-code", expiresAt: new Date() } });
    await store.remove("signInCodes", code.id);
    await store.remove("signInCodes", code.id);
    expect(await db.magicToken.count({ where: { id: code.id } })).toBe(0);
  });
});

describe("PrismaUserRepository account management", () => {
  it("deleting an account deletes its profile, sign-in methods and sessions", async () => {
    const users = new PrismaUserRepository(db);
    const user = await users.create({ email: "gone@test.pt", name: "Gone", provider: "email-code", providerId: "gone@test.pt" });
    await db.authSession.create({ data: { userId: user.id, tokenHash: "t-gone", expiresAt: new Date(Date.now() + 1e6) } });
    await users.delete(user.id);
    expect(await db.user.count({ where: { id: user.id } })).toBe(0);
    expect(await db.profile.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.authMethod.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.authSession.count({ where: { userId: user.id } })).toBe(0);
  });

  it("counts games a user played in or registered", async () => {
    const club = await db.club.create({ data: { name: "Count" } });
    const [p, q, r] = await Promise.all(["p", "q", "r"].map((n) => db.user.create({ data: { email: `${n}@count.pt` } })));
    await db.game.create({ data: { type: "SINGLES", clubId: club.id, team1PlayerIds: [p!.id], team2PlayerIds: [q!.id], sets: [], registeredById: r!.id } });
    const games = new PrismaGameRepository(db);
    expect(await games.countForUser(p!.id)).toBe(1);
    expect(await games.countForUser(r!.id)).toBe(1);
    expect(await games.countForUser(club.id)).toBe(0);
  });
});
