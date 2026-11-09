import { describe, expect, it } from "bun:test";
import { APP_ORIGIN, testApi } from "../support";

describe("HTTP layer", () => {
  it("every /api response is private, no-store and has a request id (errors too)", async () => {
    const api = testApi();
    for (const path of ["/api/health", "/api/auth/session", "/api/games/mine", "/api/nope"]) {
      const res = await api.request(path);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(res.headers.get("x-request-id")).toBeTruthy();
    }
  });

  it("204 answers carry no body (Node, which Vercel runs, throws on one) but keep their headers", async () => {
    const api = testApi();
    const res = await api.request("/api/auth/sign-out", {
      method: "POST",
      headers: { origin: APP_ORIGIN, "content-type": "application/json", cookie: "__Host-bb_session=dummy-token-1234567890" },
      body: "{}",
    });
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
    expect(res.headers.getSetCookie().some((c) => c.startsWith("__Host-bb_session=;"))).toBe(true);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("error bodies follow the contract and never leak internals", async () => {
    const api = testApi();
    const res = await api.request("/api/games/mine");
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(Object.keys(body).sort()).toEqual(["code", "message", "requestId"]);
    expect(body.requestId).toBe(res.headers.get("x-request-id"));
  });

  it("invalid input is a 422 with the failing fields", async () => {
    const api = testApi();
    const user = api.store.addUser({});
    const res = await api.request("/api/training-reviews", {
      method: "PUT",
      headers: { cookie: api.sessionFor(user), origin: APP_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ date: "yesterday", effort: 11 }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.code).toBe("validation_failed");
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("an unexpected failure is a 500 with a generic message, logged with the request id", async () => {
    const api = testApi();
    const user = api.store.addUser({});
    const logged: unknown[] = [];
    api.infra.logger.error = (_m: string, f?: Record<string, unknown>) => void logged.push(f);
    api.infra.games.listByPlayer = async () => {
      throw new Error("mongo exploded: secret connection string");
    };
    const res = await api.request("/api/games/mine", { headers: { cookie: api.sessionFor(user) } });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("mongo");
    expect(logged).toHaveLength(1);
  });

  describe("CSRF", () => {
    const write = (api: ReturnType<typeof testApi>, cookie: string, headers: Record<string, string>) =>
      api.request("/api/training-reviews", {
        method: "PUT",
        headers: { cookie, ...headers },
        body: JSON.stringify({ date: "2026-11-01", effort: 5 }),
      });

    it("refuses a cookie-bearing write from another origin", async () => {
      const api = testApi();
      const cookie = api.sessionFor(api.store.addUser({}));
      const res = await write(api, cookie, { origin: "https://evil.test", "content-type": "application/json" });
      expect(res.status).toBe(403);
      expect(api.store.reviews.size).toBe(0);
    });

    it("refuses a write with no Origin, or as a simple form post", async () => {
      const api = testApi();
      const cookie = api.sessionFor(api.store.addUser({}));
      expect((await write(api, cookie, { "content-type": "application/json" })).status).toBe(403);
      expect((await write(api, cookie, { origin: APP_ORIGIN, "content-type": "text/plain" })).status).toBe(403);
    });

    it("accepts a same-origin JSON write", async () => {
      const api = testApi();
      const cookie = api.sessionFor(api.store.addUser({}));
      expect((await write(api, cookie, { origin: APP_ORIGIN, "content-type": "application/json" })).status).toBe(200);
    });
  });
});
