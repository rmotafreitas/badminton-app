import { describe, expect, it } from "bun:test";
import { APP_ORIGIN, testApi } from "../support";

const form = (fields: Record<string, string | Blob>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
};

const multipart = (api: ReturnType<typeof testApi>, cookie: string, method: string, path: string, body: FormData) =>
  api.request(path, { method, headers: { cookie, origin: APP_ORIGIN }, body });

describe("clubs", () => {
  it("members see their club and roster; others get 404", async () => {
    const api = testApi();
    const club = api.store.addClub("CFBG");
    const member = api.store.addUser({ name: "M", email: "m@test.pt", clubId: club.id });
    const outsider = api.store.addUser({});
    const res = await api.as(member).clubs({ id: club.id }).get();
    expect(res.data?.members.map((m) => m.name)).toEqual(["M"]);
    expect((await api.as(outsider).clubs({ id: club.id }).get()).status).toBe(404);
  });

  it("a club admin edits only their own club", async () => {
    const api = testApi();
    const mine = api.store.addClub("Mine");
    const theirs = api.store.addClub("Theirs");
    const clubAdmin = api.store.addUser({ roles: ["CLUB_ADMIN"], clubId: mine.id });
    const cookie = api.sessionFor(clubAdmin);
    expect((await multipart(api, cookie, "PATCH", `/api/clubs/${mine.id}`, form({ name: "Renamed" }))).status).toBe(200);
    expect(api.store.clubs.get(mine.id)!.name).toBe("Renamed");
    expect((await multipart(api, cookie, "PATCH", `/api/clubs/${theirs.id}`, form({ name: "Hacked" }))).status).toBe(404);
    expect(api.store.clubs.get(theirs.id)!.name).toBe("Theirs");
  });

  it("a coach can't edit the club", async () => {
    const api = testApi();
    const club = api.store.addClub("C");
    const coach = api.store.addUser({ roles: ["COACH"], clubId: club.id });
    expect((await multipart(api, api.sessionFor(coach), "PATCH", `/api/clubs/${club.id}`, form({ name: "XY" }))).status).toBe(403);
  });

  it("system admins create clubs with a picture served as a cacheable image", async () => {
    const api = testApi();
    const admin = api.store.addUser({ roles: ["SYSTEM_ADMIN"] });
    const cookie = api.sessionFor(admin);
    const res = await multipart(api, cookie, "POST", "/api/clubs", form({ name: "New Club", picture: new Blob([new Uint8Array([7, 8, 9])], { type: "image/png" }) }));
    expect(res.status).toBe(200);
    const club = (await res.json()) as any;
    expect(club.pictureUrl).toMatch(/^\/api\/media\/clubs\/[a-f0-9]{24}\/picture\/v3x70000$/);
    const image = await api.request(club.pictureUrl, { headers: { cookie } });
    expect(image.status).toBe(200);
    expect(image.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(new Uint8Array([7, 8, 9]));
  });

  it("a club with games can't be deleted; an empty one can, and its members leave it", async () => {
    const api = testApi();
    const admin = api.as(api.store.addUser({ roles: ["SYSTEM_ADMIN"] }));
    const busy = api.store.addClub("Busy");
    const empty = api.store.addClub("Empty");
    const [p1, p2] = [api.store.addUser({ clubId: busy.id }), api.store.addUser({ clubId: busy.id })];
    const member = api.store.addUser({ clubId: empty.id });
    await admin.games.post({ clubId: busy.id, type: "SINGLES", team1PlayerIds: [p1.id], team2PlayerIds: [p2.id], team1Points: 21, team2Points: 3 });
    expect((await admin.clubs({ id: busy.id }).delete()).status).toBe(409);
    expect((await admin.clubs({ id: empty.id }).delete()).status).toBe(204);
    expect(api.store.users.get(member.id)!.clubId).toBeNull();
  });

  it("assigning a user moves them into the club roster", async () => {
    const api = testApi();
    const admin = api.as(api.store.addUser({ roles: ["SYSTEM_ADMIN"] }));
    const club = api.store.addClub("C");
    const user = api.store.addUser({ name: "New" });
    expect((await admin.clubs.assignments.post({ userId: user.id, clubId: club.id })).status).toBe(204);
    expect((await admin.clubs({ id: club.id }).get()).data?.members.map((m) => m.id)).toEqual([user.id]);
  });
});

describe("profiles", () => {
  it("contact details: visible to self, staff of the club and admins; hidden from other players", async () => {
    const api = testApi();
    const club = api.store.addClub("C");
    const target = api.store.addUser({ name: "T", email: "t@test.pt", phone: "+351900000000", clubId: club.id });
    const mate = api.store.addUser({ clubId: club.id });
    const coach = api.store.addUser({ roles: ["COACH"], clubId: club.id });
    const get = (u: typeof target) => api.as(u).profiles({ userId: target.id }).get();
    expect((await get(target)).data?.email).toBe("t@test.pt");
    expect((await get(coach)).data?.phone).toBe("+351900000000");
    expect((await get(mate)).data).toMatchObject({ name: "T", email: null, phone: null });
  });

  it("updating name and photo; the session user follows", async () => {
    const api = testApi();
    const user = api.store.addUser({ name: "Old" });
    const cookie = api.sessionFor(user);
    const res = await multipart(api, cookie, "PATCH", "/api/profiles/me", form({ name: "New", bio: "Smash!", photo: new Blob([new Uint8Array([1, 2])]) }));
    expect(res.status).toBe(200);
    const profile = (await res.json()) as any;
    expect(profile).toMatchObject({ name: "New", bio: "Smash!" });
    expect(profile.photoUrl).toContain(`/api/media/profiles/${user.id}/photo/`);
    const session = await api.as(user).auth.session.get();
    expect(session.data?.user).toMatchObject({ name: "New", photoUrl: profile.photoUrl });
  });

  it("an empty file removes the photo", async () => {
    const api = testApi();
    const user = api.store.addUser({});
    const cookie = api.sessionFor(user);
    await multipart(api, cookie, "PATCH", "/api/profiles/me", form({ photo: new Blob([new Uint8Array([1])]) }));
    const res = await multipart(api, cookie, "PATCH", "/api/profiles/me", form({ photo: new Blob([]) }));
    expect(((await res.json()) as any).photoUrl).toBeNull();
  });

  it("legacy images (raw base64 or a doubled data: prefix) are still served", async () => {
    const api = testApi();
    const user = api.store.addUser({});
    const raw = Buffer.from([5, 6, 7]).toString("base64");
    api.store.profiles.set(user.id, { ...api.store.profiles.get(user.id)!, photo: `data:image/webp;base64,data:image/webp;base64,${raw}`, photoVersion: "legacy01" });
    const res = await api.request(`/api/media/profiles/${user.id}/photo/legacy01`, { headers: { cookie: api.sessionFor(user) } });
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([5, 6, 7]));
  });

  it("images need a session", async () => {
    const api = testApi();
    const user = api.store.addUser({});
    expect((await api.request(`/api/media/profiles/${user.id}/photo/abcdef12`)).status).toBe(401);
  });
});

describe("training reviews", () => {
  it("one per day: saving again replaces it; others' reviews are 404", async () => {
    const api = testApi();
    const user = api.store.addUser({});
    const other = api.store.addUser({});
    const me = api.as(user);
    await me["training-reviews"].put({ date: "2026-11-01", effort: 4 });
    const second = await me["training-reviews"].put({ date: "2026-11-01", effort: 8, note: "hard" });
    expect((await me["training-reviews"].get({ query: {} })).data).toHaveLength(1);
    expect((await me["training-reviews"].day({ date: "2026-11-01" }).get()).data?.review).toMatchObject({ effort: 8, note: "hard" });
    expect((await me["training-reviews"].day({ date: "2026-11-02" }).get()).data?.review).toBeNull();
    expect((await api.as(other)["training-reviews"]({ id: second.data!.id }).delete()).status).toBe(404);
    expect((await me["training-reviews"]({ id: second.data!.id }).delete()).status).toBe(204);
  });
});
