import { describe, expect, it } from "bun:test";
import { APP_ORIGIN, testApi } from "../support";

type Api = ReturnType<typeof testApi>;

/** A Data write: `values` as JSON plus image files, multipart like the web app sends. */
const write = (api: Api, cookie: string, method: "POST" | "PATCH", path: string, values: object, files: Record<string, Blob> = {}) => {
  const form = new FormData();
  form.set("values", JSON.stringify(values));
  for (const [k, v] of Object.entries(files)) form.set(k, v);
  return api.request(path, { method, headers: { cookie, origin: APP_ORIGIN }, body: form });
};

const get = (api: Api, cookie: string, path: string) => api.request(path, { headers: { cookie } });
const json = async (res: Response) => (await res.json()) as any;

function world() {
  const api = testApi();
  const club = api.store.addClub("CFBG");
  const other = api.store.addClub("Other");
  const admin = api.store.addUser({ name: "Root", email: "root@test.pt", roles: ["SYSTEM_ADMIN"] });
  const clubAdmin = api.store.addUser({ name: "Ana", email: "ana@test.pt", roles: ["CLUB_ADMIN", "PLAYER"], clubId: club.id });
  const coach = api.store.addUser({ name: "Rui", email: "rui@test.pt", roles: ["COACH", "PLAYER"], clubId: club.id });
  const player = api.store.addUser({ name: "Bea", email: "bea@test.pt", clubId: club.id });
  const outsider = api.store.addUser({ name: "Zed", email: "zed@test.pt", clubId: other.id });
  return { api, club, other, admin, clubAdmin, coach, player, outsider, cookie: (u: { id: string }) => api.sessionFor(u as never) };
}

describe("data: which tables a role sees", () => {
  it("system admins see every table; club admins and coaches their club's; players none", async () => {
    const w = world();
    const keys = async (u: { id: string }) => (await json(await get(w.api, w.cookie(u), "/api/data"))).map((t: any) => t.key);
    expect(await keys(w.admin)).toEqual(["clubs", "users", "games", "trainingReviews", "rallySessions", "authMethods", "authSessions", "signInCodes", "rateLimits"]);
    expect(await keys(w.clubAdmin)).toEqual(["clubs", "users", "games"]);
    expect(await keys(w.coach)).toEqual(["clubs", "users", "games"]);
    expect(await keys(w.player)).toEqual([]);
    expect((await get(w.api, w.cookie(w.player), "/api/data/users")).status).toBe(404);
    expect((await get(w.api, w.cookie(w.clubAdmin), "/api/data/authSessions")).status).toBe(404);
  });

  it("never sends secrets", async () => {
    const w = world();
    const users = await (await get(w.api, w.cookie(w.admin), "/api/data/users?pageSize=100")).text();
    const sessions = await (await get(w.api, w.cookie(w.admin), "/api/data/authSessions")).text();
    expect(users).not.toContain("passwordHash");
    expect(sessions).not.toContain("tokenHash");
    expect(sessions).not.toContain("hash:");
  });
});

describe("data: listing", () => {
  it("club admins only see their club's members, with search, sort and paging", async () => {
    const w = world();
    const page = await json(await get(w.api, w.cookie(w.clubAdmin), "/api/data/users?sort=name&dir=asc"));
    expect(page.table.scope).toBe("club");
    expect(page.rows.map((r: any) => r.values.name)).toEqual(["Ana", "Bea", "Rui"]);
    expect(page.refs.clubs[w.club.id]).toBe("CFBG");
    const found = await json(await get(w.api, w.cookie(w.clubAdmin), "/api/data/users?q=zed"));
    expect(found.total).toBe(0);
    const paged = await json(await get(w.api, w.cookie(w.clubAdmin), "/api/data/users?sort=name&dir=asc&pageSize=2&page=2"));
    expect(paged.rows.map((r: any) => r.values.name)).toEqual(["Rui"]);
    expect(paged.total).toBe(3);
  });

  it("filters by declared filter fields only", async () => {
    const w = world();
    const filters = encodeURIComponent(JSON.stringify({ roles: "COACH" }));
    const page = await json(await get(w.api, w.cookie(w.admin), `/api/data/users?filters=${filters}`));
    expect(page.rows.map((r: any) => r.values.name)).toEqual(["Rui"]);
    const bad = encodeURIComponent(JSON.stringify({ email: "x" }));
    expect((await get(w.api, w.cookie(w.admin), `/api/data/users?filters=${bad}`)).status).toBe(400);
  });

  it("a club-scoped caller can't open another club's row", async () => {
    const w = world();
    expect((await get(w.api, w.cookie(w.clubAdmin), `/api/data/users/${w.outsider.id}`)).status).toBe(404);
    expect((await get(w.api, w.cookie(w.clubAdmin), `/api/data/clubs/${w.other.id}`)).status).toBe(404);
    expect((await get(w.api, w.cookie(w.clubAdmin), `/api/data/clubs/${w.club.id}`)).status).toBe(200);
  });

  it("exports CSV with names for references and formulas defused", async () => {
    const w = world();
    w.api.store.addUser({ name: "=HYPERLINK(evil)", email: "evil@test.pt", clubId: w.club.id });
    const res = await get(w.api, w.cookie(w.clubAdmin), "/api/data/users/export?sort=name&dir=asc&lang=pt");
    expect(res.headers.get("content-type")).toContain("text/csv");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM, so Excel reads UTF-8
    const csv = new TextDecoder().decode(bytes);
    expect(csv.split("\r\n")[0]).toBe("id,Nome,Email,Telemóvel,Funções,Clube,Rating singulares,Rating pares,Ativo,Último acesso,Desde");
    expect(csv).toContain(",CFBG,");
    expect(csv).toContain("'=HYPERLINK(evil)");
    expect(csv).not.toContain("zed@test.pt");
  });

  it("reference options are scoped like the table", async () => {
    const w = world();
    const options = await json(await get(w.api, w.cookie(w.clubAdmin), "/api/data/users/options?q=a"));
    expect(options.map((o: any) => o.label).sort()).toEqual(["Ana", "Bea"]);
  });
});

describe("data: writes go through the rules", () => {
  it("a club admin edits their club with images, not another club", async () => {
    const w = world();
    const cookie = w.cookie(w.clubAdmin);
    const res = await write(w.api, cookie, "PATCH", `/api/data/clubs/${w.club.id}`, { name: "CFBG Porto" }, { banner: new Blob([new Uint8Array([1, 2, 3])]) });
    expect(res.status).toBe(200);
    const record = await json(res);
    expect(record.row.values.name).toBe("CFBG Porto");
    expect(record.row.values.banner).toMatch(/^\/api\/media\/clubs\/[a-f0-9]{24}\/banner\//);
    expect((await write(w.api, cookie, "PATCH", `/api/data/clubs/${w.other.id}`, { name: "Hacked" })).status).toBe(404);
    // Club admins can't create or delete clubs.
    expect((await write(w.api, cookie, "POST", "/api/data/clubs", { name: "Mine too" })).status).toBe(403);
    expect((await w.api.request(`/api/data/clubs/${w.club.id}`, { method: "DELETE", headers: { cookie, origin: APP_ORIGIN, "content-type": "application/json" } })).status).toBe(403);
  });

  it("rejects fields the role may not set", async () => {
    const w = world();
    const res = await write(w.api, w.cookie(w.clubAdmin), "PATCH", `/api/data/users/${w.player.id}`, { email: "new@test.pt" });
    expect(res.status).toBe(400);
    expect(w.api.store.users.get(w.player.id)!.email).toBe("bea@test.pt");
  });

  it("club admins invite by email, change roles, and remove members (who keep their games)", async () => {
    const w = world();
    const cookie = w.cookie(w.clubAdmin);
    const created = await json(await write(w.api, cookie, "POST", "/api/data/users", { name: "Nova", email: "Nova@Test.pt", roles: ["COACH"] }));
    expect(created.row.values).toMatchObject({ name: "Nova", email: "nova@test.pt", clubId: w.club.id, roles: ["COACH", "PLAYER"] });

    // Granting SYSTEM_ADMIN is ignored for club admins.
    const promoted = await json(await write(w.api, cookie, "PATCH", `/api/data/users/${w.player.id}`, { roles: ["CLUB_ADMIN", "SYSTEM_ADMIN"] }));
    expect(promoted.row.values.roles).toEqual(["CLUB_ADMIN", "PLAYER"]);

    const removed = await w.api.request(`/api/data/users/${w.player.id}`, { method: "DELETE", headers: { cookie, origin: APP_ORIGIN, "content-type": "application/json" } });
    expect(removed.status).toBe(204);
    expect(w.api.store.users.get(w.player.id)).toMatchObject({ clubId: null, roles: ["PLAYER"] });
  });

  it("system admins create, update and delete accounts; accounts with games are kept", async () => {
    const w = world();
    const cookie = w.cookie(w.admin);
    const created = await json(await write(w.api, cookie, "POST", "/api/data/users", { email: "new@test.pt", clubId: w.other.id, roles: ["CLUB_ADMIN"] }));
    expect(created.row.values).toMatchObject({ email: "new@test.pt", clubId: w.other.id, roles: ["CLUB_ADMIN", "PLAYER"] });
    expect((await write(w.api, cookie, "POST", "/api/data/users", { email: "ana@test.pt" })).status).toBe(409);
    expect((await write(w.api, cookie, "POST", "/api/data/users", { name: "No contact" })).status).toBe(400);

    const updated = await json(await write(w.api, cookie, "PATCH", `/api/data/users/${created.row.id}`, { isActive: false, name: "Neo" }));
    expect(updated.row.values).toMatchObject({ isActive: false, name: "Neo" });

    await w.api.as(w.admin).games.post({ clubId: w.club.id, type: "SINGLES", team1PlayerIds: [w.player.id], team2PlayerIds: [w.coach.id], team1Points: 21, team2Points: 9 });
    const del = (id: string) => w.api.request(`/api/data/users/${id}`, { method: "DELETE", headers: { cookie, origin: APP_ORIGIN, "content-type": "application/json" } });
    expect((await del(w.player.id)).status).toBe(409);
    expect((await del(created.row.id)).status).toBe(204);
    expect(w.api.store.users.has(created.row.id)).toBe(false);
    expect((await del(w.admin.id)).status).toBe(422);
  });

  it("editing a game's score recalculates ratings; coaches may, players may not", async () => {
    const w = world();
    const game = await w.api.as(w.admin).games.post({ clubId: w.club.id, type: "SINGLES", team1PlayerIds: [w.player.id], team2PlayerIds: [w.clubAdmin.id], team1Points: 21, team2Points: 9 });
    const id = (game.data as any).id;
    const before = w.api.store.users.get(w.player.id)!.eloSingles;
    const res = await write(w.api, w.cookie(w.coach), "PATCH", `/api/data/games/${id}`, { sets: [{ team1Score: 9, team2Score: 21 }] });
    expect(res.status).toBe(200);
    expect(w.api.store.users.get(w.player.id)!.eloSingles).toBeLessThan(before);
    expect((await write(w.api, w.cookie(w.coach), "PATCH", `/api/data/games/${id}`, { sets: [] })).status).toBe(400);
    expect((await write(w.api, w.cookie(w.player), "PATCH", `/api/data/games/${id}`, { sets: [{ team1Score: 1, team2Score: 21 }] })).status).toBe(404);
  });

  it("revoking a session signs that device out", async () => {
    const w = world();
    const victimCookie = w.cookie(w.player);
    const [session] = [...w.api.store.sessions.values()].filter((s) => s.userId === w.player.id);
    const res = await w.api.request(`/api/data/authSessions/${session!.id}`, { method: "DELETE", headers: { cookie: w.cookie(w.admin), origin: APP_ORIGIN, "content-type": "application/json" } });
    expect(res.status).toBe(204);
    // Anonymous now: the session answers null.
    expect(await json(await get(w.api, victimCookie, "/api/auth/session"))).toBeNull();
  });
});

describe("club membership endpoints", () => {
  it("adds an existing club-less user, refuses one from another club, and keeps a last admin", async () => {
    const w = world();
    const free = w.api.store.addUser({ name: "Free", email: "free@test.pt" });
    const admin = w.api.as(w.clubAdmin);
    expect((await admin.clubs({ id: w.club.id }).members.post({ email: "FREE@test.pt" })).data).toMatchObject({ id: free.id, clubId: w.club.id });
    expect((await admin.clubs({ id: w.club.id }).members.post({ userId: w.outsider.id })).status).toBe(409);
    expect((await admin.clubs({ id: w.other.id }).members.post({ userId: free.id })).status).toBe(404);
    // The only club admin can't demote or remove themselves.
    expect((await admin.clubs({ id: w.club.id }).members({ userId: w.clubAdmin.id }).roles.put({ roles: ["PLAYER"] })).status).toBe(422);
    expect((await admin.clubs({ id: w.club.id }).members({ userId: w.clubAdmin.id }).delete()).status).toBe(422);
    // With a second admin, it's fine.
    await admin.clubs({ id: w.club.id }).members({ userId: w.coach.id }).roles.put({ roles: ["CLUB_ADMIN"] });
    expect((await admin.clubs({ id: w.club.id }).members({ userId: w.clubAdmin.id }).roles.put({ roles: ["PLAYER"] })).data).toEqual({ roles: ["PLAYER"] });
  });

  it("coaches and players can't manage members", async () => {
    const w = world();
    expect((await w.api.as(w.coach).clubs({ id: w.club.id }).members.post({ email: "x@test.pt" })).status).toBe(403);
    expect((await w.api.as(w.player).clubs({ id: w.club.id }).members({ userId: w.coach.id }).delete()).status).toBe(403);
  });

  it("an invited person lands in the club on first sign-in, even with registration closed", async () => {
    const api = testApi({ registrationOpen: false });
    const club = api.store.addClub("C");
    const admin = api.store.addUser({ roles: ["CLUB_ADMIN"], clubId: club.id });
    await api.as(admin).clubs({ id: club.id }).members.post({ email: "guest@test.pt", name: "Guest" });
    await api.anonymous.auth["sign-in"].start.post({ provider: "email-code", email: "guest@test.pt" });
    const code = api.store.sent.at(-1)!.secret;
    const res = await api.anonymous.auth["sign-in"].complete.post({ provider: "email-code", email: "guest@test.pt", code });
    expect(res.status).toBe(200);
    expect((res.data as any).user).toMatchObject({ name: "Guest", clubId: club.id });
  });
});
