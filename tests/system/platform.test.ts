import { describe, expect, it } from "bun:test";
import { testApi } from "../support";

const PUBLIC = new Set([
  "GET /api/health",
  "GET /api/health/ready",
  "GET /api/auth/session",
  "POST /api/auth/sign-in/start",
  "POST /api/auth/sign-in/complete",
  "POST /api/auth/sign-out",
  "GET /api/maintenance/daily",
]);

const ID = "0000000000000000000000aa";

describe("every protected route refuses anonymous callers", () => {
  const api = testApi();
  const routes = api.app.routes
    .map((r) => ({ method: r.method, path: r.path }))
    .filter((r) => r.method !== "HEAD" && r.method !== "OPTIONS" && !PUBLIC.has(`${r.method} ${r.path}`));

  it("covers a meaningful number of routes", () => {
    expect(routes.length).toBeGreaterThan(30);
  });

  for (const route of routes) {
    it(`${route.method} ${route.path}`, async () => {
      const path = route.path.replace(/:date/g, "2026-11-01").replace(/:version/g, "abcdef12").replace(/:kind/g, route.path.includes("/clubs/") ? "picture" : "photo").replace(/:\w+/g, ID);
      const res = await api.request(path, {
        method: route.method,
        headers: { "content-type": "application/json" },
        body: ["GET", "DELETE"].includes(route.method) ? undefined : "{}",
      });
      // 401 normally; 422 when the (public) schema rejects the body before authentication runs. Never data, never a crash.
      expect([401, 422]).toContain(res.status);
      if (["GET", "DELETE"].includes(route.method)) expect(res.status).toBe(401);
    });
  }
});

describe("platform", () => {
  it("readiness follows the database", async () => {
    const api = testApi();
    expect((await api.request("/api/health/ready")).status).toBe(200);
    api.store.healthy = false;
    const down = await api.request("/api/health/ready");
    expect(down.status).toBe(503);
    expect(await down.json()).toEqual({ ready: false, checks: { database: false } });
  });

  it("security headers on every response", async () => {
    const api = testApi();
    const res = await api.request("/api/games/mine");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("the daily cron needs its secret, then purges expired credentials and videos", async () => {
    const api = testApi({ cronSecret: "s3cret" });
    const user = api.store.addUser({});
    api.sessionFor(user);
    await api.anonymous.auth["sign-in"].start.post({ provider: "email-code", email: "x@test.pt" });
    expect((await api.request("/api/maintenance/daily")).status).toBe(401);
    expect((await api.request("/api/maintenance/daily", { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
    api.clock.advance(31 * 86_400_000);
    const res = await api.request("/api/maintenance/daily", { headers: { authorization: "Bearer s3cret" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sessions: 1, challenges: 1, videos: 0 });
    expect(api.store.sessions.size).toBe(0);
  });

  it("the cron is closed when no secret is configured", async () => {
    const api = testApi();
    expect((await api.request("/api/maintenance/daily", { headers: { authorization: "Bearer undefined" } })).status).toBe(401);
  });
});
