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

  it("exports in big pages, scoped and filtered like the list", async () => {
    const w = world();
    const page = await json(await get(w.api, w.cookie(w.clubAdmin), "/api/data/users/export?sort=name&dir=asc&pageSize=1000"));
    expect(page.pageSize).toBe(1000);
    expect(page.rows.map((r: any) => r.values.name)).toEqual(["Ana", "Bea", "Rui"]);
    expect(page.refs.clubs[w.club.id]).toBe("CFBG");
    // The list itself stays at 100 a page; exports stop at 100 000 rows.
    expect((await get(w.api, w.cookie(w.clubAdmin), "/api/data/users?pageSize=1000")).status).toBe(422);
    expect((await get(w.api, w.cookie(w.clubAdmin), "/api/data/users/export?pageSize=1000&page=101")).status).toBe(400);
    expect((await get(w.api, w.cookie(w.player), "/api/data/users/export")).status).toBe(404);
  });

  it("checks every filter value against its field", async () => {
    const w = world();
    const status = async (filters: object, table = "users") =>
      (await get(w.api, w.cookie(w.admin), `/api/data/${table}?filters=${encodeURIComponent(JSON.stringify(filters))}`)).status;
    expect(await status({ roles: "COACH" })).toBe(200);
    expect(await status({ roles: "KING" })).toBe(400);
    // An object (a query operator) never reaches the database: refused at the edge or by the use case.
    expect(await status({ roles: { $ne: null } })).toBeOneOf([400, 422]);
    expect(await status({ isActive: "yes" })).toBe(400);
    expect(await status({ clubId: "nope" })).toBe(400);
    expect(await status({ type: "SINGLES" }, "games")).toBe(200);
    expect(await status({ type: "TRIPLES" }, "games")).toBe(400);
    expect(await status({ type: { $gt: "" } }, "games")).toBeOneOf([400, 422]);
    // "No club" matches accounts whose club was never set too.
    const noClub = await json(await get(w.api, w.cookie(w.admin), `/api/data/users?filters=${encodeURIComponent(JSON.stringify({ clubId: null }))}`));
    expect(noClub.rows.map((r: any) => r.values.name)).toEqual(["Root"]);
  });

  it("views are named lists, narrowed further by filters", async () => {
    const w = world();
    // Deactivated the way a system admin does it, through Data.
    expect((await write(w.api, w.cookie(w.admin), "PATCH", `/api/data/users/${w.player.id}`, { isActive: false })).status).toBe(200);
    const names = async (query: string) =>
      (await json(await get(w.api, w.cookie(w.clubAdmin), `/api/data/users?sort=name&dir=asc&${query}`))).rows.map((r: any) => r.values.name);
    const table = (await json(await get(w.api, w.cookie(w.clubAdmin), "/api/data/users"))).table;
    expect(table.views.map((v: any) => v.key)).toEqual(["active", "inactive", "coaches", "clubAdmins", "neverSignedIn"]);
    expect(await names("view=inactive")).toEqual(["Bea"]);
    expect(await names("view=coaches")).toEqual(["Rui"]);
    // Ana is the one asking, so she has just been seen.
    expect(await names("view=neverSignedIn")).toEqual(["Bea", "Rui"]);
    expect(await names(`view=active&filters=${encodeURIComponent(JSON.stringify({ roles: "CLUB_ADMIN" }))}`)).toEqual(["Ana"]);
    expect((await get(w.api, w.cookie(w.clubAdmin), "/api/data/users?view=everything")).status).toBe(400);
  });

  it("date views count from now", async () => {
    const w = world();
    const admin = w.api.as(w.admin);
    await admin.games.post({ clubId: w.club.id, type: "SINGLES", team1PlayerIds: [w.player.id], team2PlayerIds: [w.coach.id], team1Points: 21, team2Points: 9 });
    w.api.clock.advance(40 * 86_400_000);
    const fourth = w.api.store.addUser({ name: "Duo", email: "duo@test.pt", clubId: w.club.id });
    // A fresh session: the first one has expired by now.
    const doubles = await w.api.as(w.admin).games.post({ clubId: w.club.id, type: "DOUBLES", team1PlayerIds: [w.player.id, w.clubAdmin.id], team2PlayerIds: [w.coach.id, fourth.id], team1Points: 21, team2Points: 9 });
    expect(doubles.status).toBe(200);
    const page = await json(await get(w.api, w.cookie(w.admin), "/api/data/games?view=last30Days"));
    expect(page.rows.map((r: any) => r.values.type)).toEqual(["DOUBLES"]);
    expect(page.table.fields.find((f: any) => f.key === "type").options).toEqual([
      { value: "SINGLES", label: { en: "Singles", pt: "Singulares" } },
      { value: "DOUBLES", label: { en: "Doubles", pt: "Pares" } },
    ]);
  });

  it("related rows: counts in scope, and the child list filtered to that row", async () => {
    const w = world();
    const admin = w.api.as(w.admin);
    await admin.games.post({ clubId: w.club.id, type: "SINGLES", team1PlayerIds: [w.player.id], team2PlayerIds: [w.coach.id], team1Points: 21, team2Points: 9 });
    await admin.games.post({ clubId: w.club.id, type: "SINGLES", team1PlayerIds: [w.coach.id], team2PlayerIds: [w.player.id], team1Points: 21, team2Points: 9 });
    await admin.games.post({ clubId: w.club.id, type: "SINGLES", team1PlayerIds: [w.coach.id], team2PlayerIds: [w.clubAdmin.id], team1Points: 21, team2Points: 9 });
    // A club admin sees only the related tables they may open.
    const counts = await json(await get(w.api, w.cookie(w.clubAdmin), `/api/data/users/${w.player.id}/related`));
    expect(counts).toEqual([{ table: "games", label: { en: "Games", pt: "Jogos" }, count: 2 }]);
    const forAdmin = await json(await get(w.api, w.cookie(w.admin), `/api/data/users/${w.player.id}/related`));
    expect(forAdmin.map((c: any) => c.table)).toEqual(["games", "rallySessions", "trainingReviews", "authMethods", "authSessions"]);
    // Either team counts: the player is on team 1 of one game and team 2 of the other.
    const games = await json(await get(w.api, w.cookie(w.clubAdmin), `/api/data/games?of=users:${w.player.id}`));
    expect(games.total).toBe(2);
    expect(games.of).toEqual({ table: "users", id: w.player.id, label: "Bea" });
    const club = await json(await get(w.api, w.cookie(w.clubAdmin), `/api/data/users?of=clubs:${w.club.id}`));
    expect(club.total).toBe(3);
    // Someone the caller can't see is NotFound, and only declared relations exist.
    expect((await get(w.api, w.cookie(w.clubAdmin), `/api/data/games?of=users:${w.outsider.id}`)).status).toBe(404);
    expect((await get(w.api, w.cookie(w.clubAdmin), `/api/data/users/${w.outsider.id}/related`)).status).toBe(404);
    expect((await get(w.api, w.cookie(w.clubAdmin), `/api/data/clubs?of=users:${w.player.id}`)).status).toBe(400);
  });

  it("a nameless account reads as its email only to those who may see it", async () => {
    const w = world();
    const nameless = w.api.store.addUser({ email: "ghost@test.pt", clubId: w.other.id });
    const game = await w.api.as(w.admin).games.post({ clubId: w.club.id, type: "SINGLES", team1PlayerIds: [w.player.id], team2PlayerIds: [nameless.id], team1Points: 21, team2Points: 9 });
    const id = (game.data as any).id;
    const forCoach = await json(await get(w.api, w.cookie(w.coach), `/api/data/games/${id}`));
    expect(forCoach.refs.users[nameless.id]).toBe(`#${nameless.id.slice(-6)}`);
    expect(JSON.stringify(forCoach)).not.toContain("ghost@test.pt");
    const forAdmin = await json(await get(w.api, w.cookie(w.admin), `/api/data/games/${id}`));
    expect(forAdmin.refs.users[nameless.id]).toBe("ghost@test.pt");
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
    const res = await write(w.api, w.cookie(w.clubAdmin), "PATCH", `/api/data/users/${w.player.id}`, { clubId: w.other.id, eloSingles: 999 });
    expect(res.status).toBe(400);
    expect(w.api.store.users.get(w.player.id)!.clubId).toBe(w.club.id);
  });

  it("club admins invite by email, change roles, and remove members (who keep their games)", async () => {
    const w = world();
    const cookie = w.cookie(w.clubAdmin);
    const created = await json(await write(w.api, cookie, "POST", "/api/data/users", { name: "Nova", email: "Nova@Test.pt", roles: ["COACH"] }));
    expect(created.row.values).toMatchObject({ name: "Nova", email: "nova@test.pt", clubId: w.club.id, roles: ["COACH", "PLAYER"] });

    // Granting SYSTEM_ADMIN is refused (400), not quietly dropped.
    expect((await write(w.api, cookie, "PATCH", `/api/data/users/${w.player.id}`, { roles: ["CLUB_ADMIN", "SYSTEM_ADMIN"] })).status).toBe(400);
    expect((await write(w.api, cookie, "POST", "/api/data/users", { email: "boss@test.pt", roles: ["SYSTEM_ADMIN"] })).status).toBe(400);
    const promoted = await json(await write(w.api, cookie, "PATCH", `/api/data/users/${w.player.id}`, { roles: ["CLUB_ADMIN"] }));
    expect(promoted.row.values.roles).toEqual(["CLUB_ADMIN", "PLAYER"]);

    // An existing account without a club joins with the roles chosen, like an invite.
    const free = w.api.store.addUser({ name: "Free", email: "free@test.pt" });
    const joined = await json(await write(w.api, cookie, "POST", "/api/data/users", { email: "free@test.pt", roles: ["COACH"] }));
    expect(joined.row.id).toBe(free.id);
    expect(joined.row.values.roles).toEqual(["COACH", "PLAYER"]);

    const removed = await w.api.request(`/api/data/users/${w.player.id}`, { method: "DELETE", headers: { cookie, origin: APP_ORIGIN, "content-type": "application/json" } });
    expect(removed.status).toBe(204);
    expect(w.api.store.users.get(w.player.id)).toMatchObject({ clubId: null, roles: ["PLAYER"] });
  });

  it("club admins edit everything they can set when adding someone, plus active; never the club", async () => {
    const w = world();
    const cookie = w.cookie(w.clubAdmin);
    const table = (await json(await get(w.api, cookie, "/api/data/users"))).table;
    expect(table.editFields).toEqual(["name", "email", "phone", "roles", "isActive"]);
    const edited = await json(
      await write(w.api, cookie, "PATCH", `/api/data/users/${w.player.id}`, { name: "Beatriz", email: "Beatriz@New.pt", phone: "912 345 678", roles: ["COACH"], isActive: false }),
    );
    expect(edited.row.values).toMatchObject({ name: "Beatriz", email: "beatriz@new.pt", roles: ["COACH", "PLAYER"], isActive: false, clubId: w.club.id });
    expect(edited.row.values.phone).toMatch(/912345678$/);
    // Moving someone to another club stays a system admin's job.
    expect((await write(w.api, cookie, "PATCH", `/api/data/users/${w.coach.id}`, { clubId: w.other.id })).status).toBe(400);
    // Contacts stay unique, and an account keeps one to sign in with.
    expect((await write(w.api, cookie, "PATCH", `/api/data/users/${w.coach.id}`, { email: "ana@test.pt" })).status).toBe(409);
    expect((await write(w.api, cookie, "PATCH", `/api/data/users/${w.coach.id}`, { email: null, phone: null })).status).toBe(400);
    // Another club's member: not found.
    expect((await write(w.api, cookie, "PATCH", `/api/data/users/${w.outsider.id}`, { name: "X" })).status).toBe(404);
  });

  it("a club keeps an active club admin, and nobody deactivates themselves", async () => {
    const w = world();
    const cookie = w.cookie(w.clubAdmin);
    const self = await write(w.api, cookie, "PATCH", `/api/data/users/${w.clubAdmin.id}`, { isActive: false });
    expect(self.status).toBe(422);
    // Rui becomes a second admin and is deactivated: fine, Ana is still an active admin.
    await write(w.api, cookie, "PATCH", `/api/data/users/${w.coach.id}`, { roles: ["CLUB_ADMIN"] });
    expect((await write(w.api, cookie, "PATCH", `/api/data/users/${w.coach.id}`, { isActive: false })).status).toBe(200);
    // Ana is now the only *active* admin: Rui (inactive) doesn't count, so she can't be demoted or removed.
    expect((await write(w.api, w.cookie(w.admin), "PATCH", `/api/data/users/${w.coach.id}`, { isActive: true })).status).toBe(200);
    const rui = w.cookie(w.coach);
    expect((await write(w.api, rui, "PATCH", `/api/data/users/${w.clubAdmin.id}`, { isActive: false })).status).toBe(200);
    expect((await write(w.api, rui, "PATCH", `/api/data/users/${w.coach.id}`, { roles: ["PLAYER"] })).status).toBe(422);
    const removeSelf = await w.api.request(`/api/data/users/${w.coach.id}`, { method: "DELETE", headers: { cookie: rui, origin: APP_ORIGIN, "content-type": "application/json" } });
    expect(removeSelf.status).toBe(422);
    // A system admin may still change anything.
    expect((await write(w.api, w.cookie(w.admin), "PATCH", `/api/data/users/${w.coach.id}`, { roles: ["PLAYER"] })).status).toBe(200);
  });

  it("coaches see members but can't edit them", async () => {
    const w = world();
    const cookie = w.cookie(w.coach);
    const table = (await json(await get(w.api, cookie, "/api/data/users"))).table;
    expect(table.canUpdate).toBe(false);
    expect((await write(w.api, cookie, "PATCH", `/api/data/users/${w.player.id}`, { name: "Nope" })).status).toBe(403);
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

  it("staff change a game's players and type with the registering rules; ratings follow", async () => {
    const w = world();
    const game = await w.api.as(w.admin).games.post({ clubId: w.club.id, type: "SINGLES", team1PlayerIds: [w.player.id], team2PlayerIds: [w.clubAdmin.id], team1Points: 21, team2Points: 9 });
    const id = (game.data as any).id;
    const cookie = w.cookie(w.coach);
    const beaBefore = w.api.store.users.get(w.player.id)!.eloSingles;
    expect(beaBefore).not.toBe(200);
    // Bea out, Rui in: Bea goes back to the starting rating, Rui gets hers.
    const swapped = await write(w.api, cookie, "PATCH", `/api/data/games/${id}`, { team1PlayerIds: [w.coach.id] });
    expect(swapped.status).toBe(200);
    expect((await json(swapped)).row.values.team1PlayerIds).toEqual([w.coach.id]);
    expect(w.api.store.users.get(w.player.id)!.eloSingles).toBe(200);
    expect(w.api.store.users.get(w.coach.id)!.eloSingles).toBe(beaBefore);
    // Doubles needs two a side; unknown people are refused.
    expect((await write(w.api, cookie, "PATCH", `/api/data/games/${id}`, { type: "DOUBLES" })).status).toBe(422);
    const fourth = w.api.store.addUser({ name: "Duo", email: "duo@test.pt", clubId: w.club.id });
    const doubles = await write(w.api, cookie, "PATCH", `/api/data/games/${id}`, {
      type: "DOUBLES",
      team1PlayerIds: [w.coach.id, w.player.id],
      team2PlayerIds: [w.clubAdmin.id, fourth.id],
    });
    expect(doubles.status).toBe(200);
    expect((await write(w.api, cookie, "PATCH", `/api/data/games/${id}`, { team2PlayerIds: [w.clubAdmin.id, "64b000000000000000000000"] })).status).toBe(422);
  });

  it("recordings: a system admin keeps them within the owner's pin limit, and deleting removes the files", async () => {
    const w = world();
    const owner = w.api.as(w.player);
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const s = await owner["rally-sessions"].post({ clientId: `client-000${i}`, recordedAt: w.api.clock.now().toISOString(), durationS: 42 });
      ids.push((s.data as any).id);
    }
    const cookie = w.cookie(w.admin);
    for (const id of ids.slice(0, 5)) expect((await write(w.api, cookie, "PATCH", `/api/data/rallySessions/${id}`, { pinned: true })).status).toBe(200);
    const over = await write(w.api, cookie, "PATCH", `/api/data/rallySessions/${ids[5]}`, { pinned: true });
    expect(over.status).toBe(409);
    expect((await json(over)).code).toBe("pin_limit");
    const del = await w.api.request(`/api/data/rallySessions/${ids[5]}`, { method: "DELETE", headers: { cookie, origin: APP_ORIGIN, "content-type": "application/json" } });
    expect(del.status).toBe(204);
    expect(w.api.store.rally.has(ids[5]!)).toBe(false);
  });

  it("training reviews: no notes in Data, and a system admin can remove one", async () => {
    const w = world();
    await w.api.as(w.player)["training-reviews"].put({ date: "2026-02-10", effort: 7, note: "private thoughts" });
    const page = await json(await get(w.api, w.cookie(w.admin), "/api/data/trainingReviews"));
    expect(page.table.fields.map((f: any) => f.key)).not.toContain("note");
    expect(JSON.stringify(page)).not.toContain("private thoughts");
    const id = page.rows[0].id;
    const del = await w.api.request(`/api/data/trainingReviews/${id}`, { method: "DELETE", headers: { cookie: w.cookie(w.admin), origin: APP_ORIGIN, "content-type": "application/json" } });
    expect(del.status).toBe(204);
    expect(w.api.store.reviews.size).toBe(0);
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

describe("account kinds: a system admin is never in a club and never a player", () => {
  it("can't be created in a club, put in one, or added to one", async () => {
    const w = world();
    const cookie = w.cookie(w.admin);
    expect((await write(w.api, cookie, "POST", "/api/data/users", { email: "ops@test.pt", roles: ["SYSTEM_ADMIN"], clubId: w.club.id })).status).toBe(422);
    const ops = await json(await write(w.api, cookie, "POST", "/api/data/users", { email: "ops@test.pt", roles: ["SYSTEM_ADMIN", "PLAYER", "COACH"] }));
    expect(ops.row.values).toMatchObject({ roles: ["SYSTEM_ADMIN"], clubId: null });
    expect((await write(w.api, cookie, "PATCH", `/api/data/users/${ops.row.id}`, { clubId: w.club.id })).status).toBe(422);
    expect((await w.api.as(w.admin).clubs.assignments.post({ userId: ops.row.id, clubId: w.club.id })).status).toBe(422);
    expect((await w.api.as(w.clubAdmin).clubs({ id: w.club.id }).members.post({ email: "ops@test.pt" })).status).toBe(409);
  });

  it("making a member a system admin means taking them out of the club in the same change", async () => {
    const w = world();
    const cookie = w.cookie(w.admin);
    expect((await write(w.api, cookie, "PATCH", `/api/data/users/${w.player.id}`, { roles: ["SYSTEM_ADMIN"] })).status).toBe(422);
    const promoted = await json(await write(w.api, cookie, "PATCH", `/api/data/users/${w.player.id}`, { roles: ["SYSTEM_ADMIN"], clubId: null }));
    expect(promoted.row.values).toMatchObject({ roles: ["SYSTEM_ADMIN"], clubId: null });
  });

  it("moving someone to another club drops their old club's roles", async () => {
    const w = world();
    await w.api.as(w.admin).clubs.assignments.post({ userId: w.clubAdmin.id, clubId: w.other.id });
    expect(w.api.store.users.get(w.clubAdmin.id)).toMatchObject({ clubId: w.other.id, roles: ["PLAYER"] });
    const moved = await json(await write(w.api, w.cookie(w.admin), "PATCH", `/api/data/users/${w.coach.id}`, { clubId: w.other.id }));
    expect(moved.row.values).toMatchObject({ clubId: w.other.id, roles: ["PLAYER"] });
  });

  it("records when someone last used the app, at most hourly", async () => {
    const w = world();
    const cookie = w.cookie(w.player);
    await get(w.api, cookie, "/api/auth/session");
    const first = w.api.store.users.get(w.player.id)!.lastAccess;
    expect(first).toEqual(w.api.clock.now());
    w.api.clock.advance(10 * 60_000);
    await get(w.api, cookie, "/api/auth/session");
    expect(w.api.store.users.get(w.player.id)!.lastAccess).toEqual(first);
    w.api.clock.advance(60 * 60_000);
    await get(w.api, cookie, "/api/auth/session");
    expect(w.api.store.users.get(w.player.id)!.lastAccess!.getTime()).toBeGreaterThan(first!.getTime());
  });
});
