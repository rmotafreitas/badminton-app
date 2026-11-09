import { describe, expect, it } from "bun:test";
import { testApi } from "../support";

function club4(api: ReturnType<typeof testApi>) {
  const club = api.store.addClub("CFBG");
  const other = api.store.addClub("Other");
  const [a, b, c, d] = ["Ana", "Bea", "Carlos", "Duarte"].map((name) => api.store.addUser({ name, clubId: club.id }));
  const coach = api.store.addUser({ name: "Coach", roles: ["COACH"], clubId: club.id });
  const outsider = api.store.addUser({ name: "Out", clubId: other.id });
  const otherCoach = api.store.addUser({ name: "OC", roles: ["COACH"], clubId: other.id });
  const admin = api.store.addUser({ roles: ["SYSTEM_ADMIN"] });
  return { club, other, a: a!, b: b!, c: c!, d: d!, coach, outsider, otherCoach, admin };
}

const singles = (clubId: string, p1: string, p2: string, sets = [{ team1Score: 21, team2Score: 15 }]) => ({
  clubId,
  type: "SINGLES" as const,
  team1PlayerIds: [p1],
  team2PlayerIds: [p2],
  sets,
});

describe("registering games", () => {
  it("a player registers a game they played; ratings move at once", async () => {
    const api = testApi();
    const { club, a, b } = club4(api);
    const res = await api.as(a).games.post(singles(club.id, a.id, b.id));
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ winner: "team1", team1SetsWon: 1, isQuickMode: true });
    expect(res.data?.team1Players[0]).toMatchObject({ id: a.id, name: "Ana", photoUrl: null });
    expect(api.store.users.get(a.id)!.eloSingles).toBe(216);
    expect(api.store.users.get(b.id)!.eloSingles).toBe(184);
    expect(api.store.users.get(a.id)!.eloDoubles).toBe(200);
  });

  it("a quick result (points) is one set", async () => {
    const api = testApi();
    const { club, a, b } = club4(api);
    const res = await api.as(a).games.post({ clubId: club.id, type: "SINGLES", team1PlayerIds: [a.id], team2PlayerIds: [b.id], team1Points: 18, team2Points: 21 });
    expect(res.data).toMatchObject({ sets: [{ team1Score: 18, team2Score: 21 }], winner: "team2" });
  });

  it("a player can't register a game they didn't play", async () => {
    const api = testApi();
    const { club, a, b, c } = club4(api);
    expect((await api.as(c).games.post(singles(club.id, a.id, b.id))).status).toBe(403);
  });

  it("staff register for their own club only; admins anywhere", async () => {
    const api = testApi();
    const { club, a, b, coach, otherCoach, admin } = club4(api);
    expect((await api.as(coach).games.post(singles(club.id, a.id, b.id))).status).toBe(200);
    expect((await api.as(otherCoach).games.post(singles(club.id, a.id, b.id))).status).toBe(403);
    expect((await api.as(admin).games.post(singles(club.id, a.id, b.id))).status).toBe(200);
  });

  it("rejects impossible lineups", async () => {
    const api = testApi();
    const { club, a, b, c } = club4(api);
    const user = api.as(a);
    expect((await user.games.post({ ...singles(club.id, a.id, a.id) })).status).toBe(422);
    expect((await user.games.post({ ...singles(club.id, a.id, b.id), type: "DOUBLES" })).status).toBe(422);
    expect((await user.games.post({ ...singles(club.id, a.id, b.id), team2PlayerIds: [b.id, c.id] })).status).toBe(422);
  });

  it("rejects unknown players", async () => {
    const api = testApi();
    const { club, a } = club4(api);
    expect((await api.as(a).games.post(singles(club.id, a.id, "0000000000000000000000ff"))).status).toBe(422);
  });
});

describe("reading games", () => {
  it("club list: staff see all, players only theirs, other clubs' staff nothing", async () => {
    const api = testApi();
    const { club, a, b, c, d, coach, otherCoach } = club4(api);
    await api.as(a).games.post(singles(club.id, a.id, b.id));
    await api.as(c).games.post(singles(club.id, c.id, d.id));
    expect((await api.as(coach).games.club({ clubId: club.id }).get()).data).toHaveLength(2);
    expect((await api.as(a).games.club({ clubId: club.id }).get()).data).toHaveLength(1);
    expect((await api.as(otherCoach).games.club({ clubId: club.id }).get()).data).toHaveLength(0);
  });

  it("a game someone may not see answers 404, like a missing one", async () => {
    const api = testApi();
    const { club, a, b, c, outsider, coach } = club4(api);
    const game = (await api.as(a).games.post(singles(club.id, a.id, b.id))).data!;
    expect((await api.as(b).games({ id: game.id }).get()).status).toBe(200);
    expect((await api.as(coach).games({ id: game.id }).get()).status).toBe(200);
    expect((await api.as(c).games({ id: game.id }).get()).status).toBe(404);
    expect((await api.as(outsider).games({ id: game.id }).get()).status).toBe(404);
  });

  it("loads all players of a page of games in one lookup (no N+1)", async () => {
    const api = testApi();
    const { club, a, b, c, d, coach } = club4(api);
    for (const [x, y] of [[a, b], [c, d], [a, c], [b, d]] as const) await api.as(coach).games.post(singles(club.id, x.id, y.id));
    api.players.calls = 0;
    await api.as(coach).games.club({ clubId: club.id }).get();
    expect(api.players.calls).toBe(1);
  });

  it("shared games between me and another player", async () => {
    const api = testApi();
    const { club, a, b, c } = club4(api);
    await api.as(a).games.post(singles(club.id, a.id, b.id));
    await api.as(a).games.post(singles(club.id, a.id, c.id));
    expect((await api.as(a).games.shared({ playerId: b.id }).get()).data).toHaveLength(1);
  });
});

describe("changing games", () => {
  it("an edit replays the club's ratings from the start", async () => {
    const api = testApi();
    const { club, a, b } = club4(api);
    const first = (await api.as(a).games.post(singles(club.id, a.id, b.id))).data!;
    api.clock.advance(60_000);
    await api.as(a).games.post(singles(club.id, a.id, b.id));
    // Flip the first result: a and b now have one win each.
    const res = await api.as(a).games({ id: first.id }).patch({ sets: [{ team1Score: 10, team2Score: 21 }] });
    expect(res.status).toBe(200);
    const ra = api.store.users.get(a.id)!.eloSingles;
    const rb = api.store.users.get(b.id)!.eloSingles;
    expect(ra + rb).toBe(400);
    expect(ra).toBeGreaterThan(200);
  });

  it("deleting replays too, and players outside the game can't delete it", async () => {
    const api = testApi();
    const { club, a, b, c } = club4(api);
    const game = (await api.as(a).games.post(singles(club.id, a.id, b.id))).data!;
    expect((await api.as(c).games({ id: game.id }).delete()).status).toBe(404);
    expect((await api.as(b).games({ id: game.id }).delete()).status).toBe(204);
    // Their only game is gone, so both are back at the default rating.
    expect(api.store.users.get(a.id)!.eloSingles).toBe(200);
    expect(api.store.users.get(b.id)!.eloSingles).toBe(200);
  });

  it("a rating failure never fails the game write", async () => {
    const api = testApi();
    const { club, a, b } = club4(api);
    api.infra.users.setRatings = async () => {
      throw new Error("db down");
    };
    expect((await api.as(a).games.post(singles(club.id, a.id, b.id))).status).toBe(200);
  });
});

describe("rating history", () => {
  it("ends at the stored rating and has one point per game", async () => {
    const api = testApi();
    const { club, a, b, c } = club4(api);
    await api.as(a).games.post(singles(club.id, a.id, b.id));
    api.clock.advance(60_000);
    await api.as(c).games.post(singles(club.id, c.id, a.id));
    const history = (await api.as(b).games.ratings({ playerId: a.id }).get()).data!;
    expect(history.singles.map((p) => p.rating)).toEqual([216, api.store.users.get(a.id)!.eloSingles]);
    expect(history.doubles).toEqual([]);
  });
});
