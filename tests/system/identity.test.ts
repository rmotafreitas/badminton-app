import { describe, expect, it } from "bun:test";
import { testApi } from "../support";

const cookieOf = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith("__Host-bb_session="));

describe("session", () => {
  it("answers 200 null when signed out (no 401 noise)", async () => {
    const api = testApi();
    const { data, status } = await api.anonymous.auth.session.get();
    expect(status).toBe(200);
    expect(data).toBeNull();
  });

  it("returns the signed-in user with fresh roles and club", async () => {
    const api = testApi();
    const club = api.store.addClub("CFBG");
    const user = api.store.addUser({ name: "Ana", email: "ana@test.pt", clubId: club.id, roles: ["PLAYER"] });
    const client = api.as(user);
    await api.infra.users.setRoles(user.id, ["COACH", "PLAYER"]);
    const { data } = await client.auth.session.get();
    expect(data?.user).toMatchObject({ id: user.id, name: "Ana", clubId: club.id, roles: ["COACH", "PLAYER"], photoUrl: null });
  });

  it("clears a cookie whose session no longer exists, and the old JWT cookies", async () => {
    const api = testApi();
    const res = await api.request("/api/auth/session", { headers: { cookie: "__Host-bb_session=gone-token-123456789012345; auth_token=x" } });
    expect((await res.json()) as any).toBeNull();
    const cookies = res.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith("__Host-bb_session=;") && c.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("auth_token=;"))).toBe(true);
  });

  it("rejects a deactivated account's session", async () => {
    const api = testApi();
    const user = api.store.addUser({ isActive: false });
    const client = api.as(user);
    expect((await client.auth.session.get()).data).toBeNull();
    expect((await client.games.mine.get()).status).toBe(401);
  });

  it("extends a session close to expiry and re-sends the cookie", async () => {
    const api = testApi();
    const user = api.store.addUser({});
    const cookie = api.sessionFor(user);
    api.clock.advance(20 * 86_400_000);
    const res = await api.request("/api/auth/session", { headers: { cookie } });
    expect(cookieOf(res)).toContain("Max-Age=2592000");
  });

  it("expires after 30 days without use", async () => {
    const api = testApi();
    const user = api.store.addUser({});
    const cookie = api.sessionFor(user);
    api.clock.advance(31 * 86_400_000);
    const res = await api.request("/api/auth/session", { headers: { cookie } });
    expect((await res.json()) as any).toBeNull();
  });
});

describe("sign-in", () => {
  it("email code: sends a 6-digit code, signs in, sets an HttpOnly __Host- cookie", async () => {
    const api = testApi();
    api.store.addUser({ email: "rui@test.pt", name: "Rui" });
    const start = await api.anonymous.auth["sign-in"].start.post({ provider: "email-code", email: " Rui@Test.pt " });
    expect(start.status).toBe(200);
    const code = api.store.sent.at(-1)!;
    expect(code).toMatchObject({ channel: "email-code", to: "rui@test.pt" });
    expect(code.secret).toMatch(/^\d{6}$/);

    const res = await api.request("/api/auth/sign-in/complete", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://app.badminton.test" },
      body: JSON.stringify({ provider: "email-code", email: "rui@test.pt", code: code.secret }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).user.name).toBe("Rui");
    const cookie = cookieOf(res)!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("a code works once", async () => {
    const api = testApi();
    await api.anonymous.auth["sign-in"].start.post({ provider: "email-code", email: "a@test.pt" });
    const { secret } = api.store.sent.at(-1)!;
    const first = await api.anonymous.auth["sign-in"].complete.post({ provider: "email-code", email: "a@test.pt", code: secret });
    const again = await api.anonymous.auth["sign-in"].complete.post({ provider: "email-code", email: "a@test.pt", code: secret });
    expect(first.status).toBe(200);
    expect(again.status).toBe(401);
    expect(again.error?.value).toMatchObject({ code: "invalid_code" });
  });

  it("an expired code is refused", async () => {
    const api = testApi();
    await api.anonymous.auth["sign-in"].start.post({ provider: "phone", phone: "+351 912 345 678" });
    const { secret, to } = api.store.sent.at(-1)!;
    expect(to).toBe("+351912345678");
    api.clock.advance(11 * 60_000);
    const res = await api.anonymous.auth["sign-in"].complete.post({ provider: "phone", phone: "+351912345678", code: secret });
    expect(res.status).toBe(401);
  });

  it("rate-limits guessing a code (no brute force of 6 digits)", async () => {
    const api = testApi();
    await api.anonymous.auth["sign-in"].start.post({ provider: "email-code", email: "b@test.pt" });
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await api.anonymous.auth["sign-in"].complete.post({ provider: "email-code", email: "b@test.pt", code: "000000" })).status;
    }
    expect(last).toBe(429);
  });

  it("successful sign-ins don't use up the attempt budget (only failures do)", async () => {
    const api = testApi();
    api.store.addUser({ email: "often@test.pt", passwordHash: "pw:pw" });
    for (let i = 0; i < 15; i++) {
      const ok = await api.anonymous.auth["sign-in"].complete.post({ provider: "password", identifier: "often@test.pt", password: "pw" });
      expect(ok.status).toBe(200);
    }
    for (let i = 0; i < 10; i++) await api.anonymous.auth["sign-in"].complete.post({ provider: "password", identifier: "often@test.pt", password: "x" });
    const locked = await api.anonymous.auth["sign-in"].complete.post({ provider: "password", identifier: "often@test.pt", password: "pw" });
    expect(locked.status).toBe(429);
  });

  it("rate-limits sending", async () => {
    const api = testApi();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await api.anonymous.auth["sign-in"].start.post({ provider: "email", email: "c@test.pt" })).status);
    expect(statuses.at(-1)).toBe(429);
    expect(api.store.sent).toHaveLength(5);
  });

  it("magic link signs in and links to the existing account by email", async () => {
    const api = testApi();
    const existing = api.store.addUser({ email: "d@test.pt", name: "Dora" });
    await api.anonymous.auth["sign-in"].start.post({ provider: "email", email: "d@test.pt" });
    const { secret } = api.store.sent.at(-1)!;
    const res = await api.anonymous.auth["sign-in"].complete.post({ provider: "email", token: secret });
    expect(res.data?.user.id).toBe(existing.id);
  });

  it("only the configured methods work: the others send nothing and verify nothing", async () => {
    const api = testApi({ signInProviders: ["password"] });
    api.store.addUser({ phone: "+351912345678", passwordHash: "pw:pw" });
    const start = await api.anonymous.auth["sign-in"].start.post({ provider: "phone", phone: "+351912345678" });
    expect(start.status).toBe(400);
    expect(start.error?.value).toMatchObject({ code: "provider_unavailable" });
    expect(api.store.sent).toHaveLength(0);
    const code = await api.anonymous.auth["sign-in"].complete.post({ provider: "email-code", email: "a@test.pt", code: "123456" });
    expect(code.error?.value).toMatchObject({ code: "provider_unavailable" });
    const ok = await api.anonymous.auth["sign-in"].complete.post({ provider: "password", identifier: "+351 912 345 678", password: "pw" });
    expect(ok.status).toBe(200);
  });

  it("password: wrong password and unknown user answer the same", async () => {
    const api = testApi();
    api.store.addUser({ email: "e@test.pt", passwordHash: "pw:secret" });
    const wrong = await api.anonymous.auth["sign-in"].complete.post({ provider: "password", identifier: "e@test.pt", password: "nope" });
    const unknown = await api.anonymous.auth["sign-in"].complete.post({ provider: "password", identifier: "x@test.pt", password: "nope" });
    const ok = await api.anonymous.auth["sign-in"].complete.post({ provider: "password", identifier: "E@test.pt", password: "secret" });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.error?.value.message).toBe(unknown.error?.value.message as string);
    expect(ok.status).toBe(200);
  });

  it("password by phone, in any formatting", async () => {
    const api = testApi();
    api.store.addUser({ phone: "+351967083100", passwordHash: "pw:pw" });
    const ok = await api.anonymous.auth["sign-in"].complete.post({ provider: "password", identifier: "+351 967 083 100", password: "pw" });
    expect(ok.status).toBe(200);
  });

  it("with registration closed, unknown people get no code and no account", async () => {
    const api = testApi({ registrationOpen: false });
    const start = await api.anonymous.auth["sign-in"].start.post({ provider: "email-code", email: "new@test.pt" });
    expect(start.status).toBe(403);
    expect(api.store.sent).toHaveLength(0);
    const google = await api.anonymous.auth["sign-in"].complete.post({ provider: "google", credential: "someone" });
    expect(google.status).toBe(403);
    expect(api.store.users.size).toBe(0);
  });

  it("google creates an account when registration is open", async () => {
    const api = testApi();
    const res = await api.anonymous.auth["sign-in"].complete.post({ provider: "google", credential: "neo" });
    expect(res.data?.user).toMatchObject({ email: "neo@gmail.test", name: "Google User" });
  });

  it("a deactivated account can't sign in", async () => {
    const api = testApi();
    api.store.addUser({ email: "off@test.pt", passwordHash: "pw:pw", isActive: false });
    const res = await api.anonymous.auth["sign-in"].complete.post({ provider: "password", identifier: "off@test.pt", password: "pw" });
    expect(res.status).toBe(403);
  });
});

describe("sign-out", () => {
  it("ends the session server-side and clears the cookie", async () => {
    const api = testApi();
    const user = api.store.addUser({});
    const cookie = api.sessionFor(user);
    const res = await api.request("/api/auth/sign-out", {
      method: "POST",
      headers: { cookie, origin: "https://app.badminton.test", "content-type": "application/json" },
    });
    expect(res.status).toBe(204);
    expect(cookieOf(res)).toContain("Max-Age=0");
    expect(api.store.sessions.size).toBe(0);
    const after = await api.request("/api/games/mine", { headers: { cookie } });
    expect(after.status).toBe(401);
  });
});

describe("users (admin)", () => {
  it("only system admins list every account", async () => {
    const api = testApi();
    const admin = api.store.addUser({ roles: ["SYSTEM_ADMIN"] });
    const player = api.store.addUser({});
    expect((await api.as(admin).users.get()).data).toHaveLength(2);
    expect((await api.as(player).users.get()).status).toBe(403);
  });
});
