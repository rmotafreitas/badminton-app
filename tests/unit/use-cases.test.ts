import { describe, expect, it } from "bun:test";
import { createModules } from "@bb/bootstrap";
import { type Actor, BusinessRuleViolation, Forbidden, NotFound, RateLimited, Unauthenticated, type User } from "@bb/domain";
import { fakeInfrastructure } from "@bb/testing";

function setup(options: { registrationOpen?: boolean } = {}) {
  const fake = fakeInfrastructure();
  const m = createModules(fake.infra, { appOrigin: "https://app.test", registrationOpen: options.registrationOpen ?? true });
  const actor = (u: User, sessionId = "s"): Actor => ({ userId: u.id, sessionId, roles: u.roles, clubId: u.clubId });
  return { ...fake, m, actor };
}

describe("identity", () => {
  it("rejects malformed addresses before sending anything", async () => {
    const { m, store } = setup();
    await expect(m.startSignIn.execute({ provider: "email-code", email: "not-an-email" })).rejects.toBeInstanceOf(BusinessRuleViolation);
    await expect(m.startSignIn.execute({ provider: "phone", phone: "12" })).rejects.toBeInstanceOf(BusinessRuleViolation);
    expect(store.sent).toHaveLength(0);
  });

  it("rate limits are per address: one noisy address doesn't block another", async () => {
    const { m } = setup();
    for (let i = 0; i < 5; i++) await m.startSignIn.execute({ provider: "email-code", email: "a@x.pt" });
    await expect(m.startSignIn.execute({ provider: "email-code", email: "a@x.pt" })).rejects.toBeInstanceOf(RateLimited);
    await expect(m.startSignIn.execute({ provider: "email-code", email: "b@x.pt" })).resolves.toBeDefined();
  });

  it("a code can't be redeemed as a link (kinds are checked)", async () => {
    const { m, store } = setup();
    await m.startSignIn.execute({ provider: "email-code", email: "a@x.pt" });
    const { secret } = store.sent.at(-1)!;
    await expect(m.completeSignIn.execute({ provider: "email", token: `a@x.pt:${secret}` }, { userAgent: null })).rejects.toBeInstanceOf(Unauthenticated);
  });

  it("links a new sign-in method to the existing account with the same phone", async () => {
    const { m, store } = setup();
    const user = store.addUser({ phone: "+351911111111" });
    await m.startSignIn.execute({ provider: "phone", phone: "+351 911 111 111" });
    const issued = await m.completeSignIn.execute({ provider: "phone", phone: "+351911111111", code: store.sent.at(-1)!.secret }, { userAgent: "ua" });
    expect(issued.user.id).toBe(user.id);
    expect(store.authMethods.get("phone:+351911111111")).toBe(user.id);
  });

  it("stores only the token's hash, and the session resolves to a fresh actor", async () => {
    const { m, store } = setup();
    store.addUser({ email: "p@x.pt", passwordHash: "pw:pw", roles: ["COACH"] });
    const issued = await m.completeSignIn.execute({ provider: "password", identifier: "p@x.pt", password: "pw" }, { userAgent: null });
    const [session] = [...store.sessions.values()];
    expect(session?.tokenHash).toBe(`hash:${issued.token}`);
    expect(JSON.stringify([...store.sessions.values()])).not.toContain(`"${issued.token}"`);
    const resolved = await m.resolveSession.execute({ token: issued.token });
    expect(resolved?.actor.roles).toEqual(["COACH"]);
    expect(resolved?.renewedUntil).toBeNull();
  });

  it("refuses absurd tokens without touching the store", async () => {
    const { m } = setup();
    expect(await m.resolveSession.execute({ token: "short" })).toBeNull();
    expect(await m.resolveSession.execute({ token: "x".repeat(500) })).toBeNull();
  });

  it("closed registration never creates accounts, by any provider", async () => {
    const { m, store } = setup({ registrationOpen: false });
    await expect(m.completeSignIn.execute({ provider: "google", accessToken: "neo" }, { userAgent: null })).rejects.toBeInstanceOf(Forbidden);
    expect(store.users.size).toBe(0);
  });

  it("only system admins list users", async () => {
    const { m, store, actor } = setup();
    await expect(m.listUsers.execute({ actor: actor(store.addUser({ roles: ["CLUB_ADMIN"] })) })).rejects.toBeInstanceOf(Forbidden);
  });
});

describe("clubs", () => {
  it("validates names and hides other clubs from club admins", async () => {
    const { m, store, actor } = setup();
    const mine = store.addClub("Mine");
    const other = store.addClub("Other");
    const admin = actor(store.addUser({ roles: ["CLUB_ADMIN"], clubId: mine.id }));
    await expect(m.updateClub.execute({ actor: admin, clubId: mine.id, input: { name: " x " } })).rejects.toBeInstanceOf(BusinessRuleViolation);
    await expect(m.updateClub.execute({ actor: admin, clubId: other.id, input: { name: "Hijack" } })).rejects.toBeInstanceOf(NotFound);
    expect((await m.updateClub.execute({ actor: admin, clubId: mine.id, input: { location: "  Porto " } })).location).toBe("Porto");
  });

  it("assigning to an unknown club or user is NotFound", async () => {
    const { m, store, actor } = setup();
    const sys = actor(store.addUser({ roles: ["SYSTEM_ADMIN"] }));
    const user = store.addUser({});
    await expect(m.assignUserToClub.execute({ actor: sys, userId: user.id, clubId: "0000000000000000000000ff" })).rejects.toBeInstanceOf(NotFound);
    await expect(m.assignUserToClub.execute({ actor: sys, userId: "0000000000000000000000ff", clubId: null })).rejects.toBeInstanceOf(NotFound);
  });
});

describe("games", () => {
  it("players see only their games in a player's history; staff of the club see all", async () => {
    const { m, store, actor } = setup();
    const club = store.addClub();
    const [a, b, c] = [store.addUser({ clubId: club.id }), store.addUser({ clubId: club.id }), store.addUser({ clubId: club.id })];
    const coach = store.addUser({ roles: ["COACH"], clubId: club.id });
    const sets = [{ team1Score: 21, team2Score: 3 }];
    await m.registerGame.execute({ actor: actor(a), input: { clubId: club.id, type: "SINGLES", team1PlayerIds: [a.id], team2PlayerIds: [b.id], sets } });
    await m.registerGame.execute({ actor: actor(c), input: { clubId: club.id, type: "SINGLES", team1PlayerIds: [c.id], team2PlayerIds: [a.id], sets } });
    expect(await m.listPlayerGames.execute({ actor: actor(b), playerId: a.id })).toHaveLength(1);
    expect(await m.listPlayerGames.execute({ actor: actor(coach), playerId: a.id })).toHaveLength(2);
  });

  it("a player from another club can't register a game in this club", async () => {
    const { m, store, actor } = setup();
    const club = store.addClub();
    const other = store.addClub();
    const [a, b] = [store.addUser({ clubId: other.id }), store.addUser({ clubId: club.id })];
    await expect(
      m.registerGame.execute({ actor: actor(a), input: { clubId: club.id, type: "SINGLES", team1PlayerIds: [a.id], team2PlayerIds: [b.id], team1Points: 21, team2Points: 1 } }),
    ).rejects.toBeInstanceOf(Forbidden);
  });

  it("unknown players in stored games still render (placeholder, no crash)", async () => {
    const { m, store, actor } = setup();
    const club = store.addClub();
    const coach = store.addUser({ roles: ["COACH"], clubId: club.id });
    store.games.set("0000000000000000000000ab", {
      id: "0000000000000000000000ab",
      type: "SINGLES",
      clubId: club.id,
      team1PlayerIds: ["0000000000000000000000cc"],
      team2PlayerIds: [coach.id],
      sets: [{ team1Score: 21, team2Score: 5 }],
      registeredById: coach.id,
      playedAt: new Date(),
      createdAt: new Date(),
    });
    const [game] = await m.listClubGames.execute({ actor: actor(coach), clubId: club.id });
    expect(game?.team1Players[0]).toEqual({ id: "0000000000000000000000cc", name: null, email: null, photoVersion: null });
  });
});

describe("profiles and training", () => {
  it("profile input rules", async () => {
    const { m, store, actor } = setup();
    const me = actor(store.addUser({ name: "Me" }));
    await expect(m.updateMyProfile.execute({ actor: me, input: { name: "" } })).rejects.toBeInstanceOf(BusinessRuleViolation);
    await expect(m.updateMyProfile.execute({ actor: me, input: { bio: "x".repeat(501) } })).rejects.toBeInstanceOf(BusinessRuleViolation);
    await expect(m.updateMyProfile.execute({ actor: me, input: { birthday: "not-a-date" } })).rejects.toBeInstanceOf(BusinessRuleViolation);
    const ok = await m.updateMyProfile.execute({ actor: me, input: { birthday: "1990-05-01", bio: "  hi  ", sex: "" } });
    expect(ok).toMatchObject({ bio: "hi", sex: null });
    expect(ok.birthday?.toISOString().slice(0, 10)).toBe("1990-05-01");
  });

  it("training input rules", async () => {
    const { m, store, actor } = setup();
    const me = actor(store.addUser({}));
    await expect(m.saveTrainingReview.execute({ actor: me, input: { date: "2026-13-40", effort: 5 } })).rejects.toBeInstanceOf(BusinessRuleViolation);
    await expect(m.saveTrainingReview.execute({ actor: me, input: { date: "2026-11-01", effort: 0 } })).rejects.toBeInstanceOf(BusinessRuleViolation);
    await expect(m.saveTrainingReview.execute({ actor: me, input: { date: "2026-11-01", effort: 5.5 } })).rejects.toBeInstanceOf(BusinessRuleViolation);
    await expect(m.saveTrainingReview.execute({ actor: me, input: { date: "2026-11-01", effort: 5, note: "x".repeat(1001) } })).rejects.toBeInstanceOf(
      BusinessRuleViolation,
    );
    await m.saveTrainingReview.execute({ actor: me, input: { date: "2026-11-01", effort: 5, note: "  " } });
    expect((await m.getMyTrainingReview.execute({ actor: me, date: "2026-11-01" }))?.note).toBeNull();
    await expect(m.listMyTrainingReviews.execute({ actor: me, from: "yesterday" })).rejects.toBeInstanceOf(BusinessRuleViolation);
  });
});

describe("rally", () => {
  it("a stale lock (dead device) doesn't block submitting a result", async () => {
    const { m, store, actor, clock } = setup();
    const me = actor(store.addUser({}));
    const s = await m.createRallySession.execute({ actor: me, input: { clientId: "client-0001", recordedAt: new Date().toISOString(), durationS: 10 } });
    await m.acquireAnalysisLock.execute({ actor: me, id: s.id, deviceId: "device-dead" });
    clock.advance(11 * 60_000);
    const done = await m.submitAnalysisResult.execute({ actor: me, id: s.id, input: { summary: { ok: 1 }, format: "practice", deviceId: "device-new" } });
    expect(done.status).toBe("analysed");
  });

  it("someone who can't see a session gets NotFound, a club-mate Forbidden, when changing it", async () => {
    const { m, store, actor } = setup();
    const club = store.addClub();
    const owner = actor(store.addUser({ clubId: club.id }));
    const mate = actor(store.addUser({ clubId: club.id }));
    const stranger = actor(store.addUser({}));
    const s = await m.createRallySession.execute({ actor: owner, input: { clientId: "client-0002", recordedAt: new Date().toISOString(), durationS: 10 } });
    await expect(m.deleteRallySession.execute({ actor: mate, id: s.id })).rejects.toBeInstanceOf(Forbidden);
    await expect(m.deleteRallySession.execute({ actor: stranger, id: s.id })).rejects.toBeInstanceOf(NotFound);
  });

  it("purges expired credentials only", async () => {
    const { m, store, clock } = setup();
    const user = store.addUser({});
    store.sessions.set("old", { id: "old", userId: user.id, tokenHash: "h1", expiresAt: new Date(clock.now().getTime() - 1) });
    store.sessions.set("live", { id: "live", userId: user.id, tokenHash: "h2", expiresAt: new Date(clock.now().getTime() + 1000) });
    expect((await m.purgeExpiredCredentials.execute()).sessions).toBe(1);
    expect([...store.sessions.keys()]).toEqual(["live"]);
  });
});
