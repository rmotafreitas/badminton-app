import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AxiosError } from "axios";
import MockAdapter from "axios-mock-adapter";
import api, { createErrorHandler, _resetRefreshState, type RetryConfig } from "./api";

function makeError(opts: {
  status?: number;
  code?: string;
  message?: string;
  config?: Partial<RetryConfig>;
}): AxiosError {
  const error = new AxiosError(
    opts.message ?? "Request failed",
    opts.code ?? "ERR_BAD_REQUEST",
    opts.config as RetryConfig,
    {} as any,
    opts.status != null
      ? ({
          status: opts.status,
          statusText: "",
          headers: {} as any,
          config: opts.config as RetryConfig,
          data: {},
        } as any)
      : undefined,
  );
  return error;
}

describe("api interceptor", () => {
  let onRequest: ReturnType<typeof vi.fn<(config: RetryConfig) => Promise<unknown>>>;
  let onRefresh: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let handler: ReturnType<typeof createErrorHandler>;

  beforeEach(() => {
    _resetRefreshState();
    onRequest = vi.fn((_config: RetryConfig) => Promise.resolve({ data: "ok" as const }));
    onRefresh = vi.fn(() => Promise.resolve());
    handler = createErrorHandler({
      request: onRequest,
      refresh: onRefresh,
    });
  });

  /* ── Timeout / network retry ─────────────────────────────────────────── */

  it("retries GET once on network error then succeeds", async () => {
    const err = makeError({
      code: "ERR_NETWORK",
      message: "Network Error",
      config: { method: "get", url: "/test" },
    });

    const result = await handler(err);
    expect(result).toEqual({ data: "ok" });
    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does not retry POST on network error", async () => {
    const err = makeError({
      code: "ERR_NETWORK",
      message: "Network Error",
      config: { method: "post", url: "/test" },
    });

    await expect(handler(err)).rejects.toBeDefined();
    expect(onRequest).not.toHaveBeenCalled();
  });

  it("does not retry when already at MaxRetries", async () => {
    onRequest.mockRejectedValue(new Error("still failing"));

    const err = makeError({
      code: "ERR_NETWORK",
      message: "Network Error",
      config: { method: "get", url: "/test", __retryCount: 3 },
    });

    await expect(handler(err)).rejects.toBeDefined();
    expect(onRequest).not.toHaveBeenCalled();
  });

  it("retries on ECONNABORTED", async () => {
    const err = makeError({
      code: "ECONNABORTED",
      config: { method: "get", url: "/test" },
    });

    await handler(err);
    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("retries on ETIMEDOUT", async () => {
    const err = makeError({
      code: "ETIMEDOUT",
      config: { method: "get", url: "/test" },
    });

    await handler(err);
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  /* ── 401 refresh flow ────────────────────────────────────────────────── */

  it("refreshes and retries on 401", async () => {
    const err = makeError({
      status: 401,
      config: { method: "get", url: "/protected" },
    });

    const result = await handler(err);
    expect(result).toEqual({ data: "ok" });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/protected", __skipRefresh: true }),
    );
  });

  it("queues concurrent 401s and refreshes only once", async () => {
    let refreshResolve: () => void;
    const refreshPromise = new Promise<void>((resolve) => {
      refreshResolve = resolve;
    });
    onRefresh.mockReturnValue(refreshPromise);

    const err1 = makeError({
      status: 401,
      config: { method: "get", url: "/a" },
    });
    const err2 = makeError({
      status: 401,
      config: { method: "get", url: "/b" },
    });

    const p1 = handler(err1);
    const p2 = handler(err2);

    expect(onRefresh).toHaveBeenCalledTimes(1);
    refreshResolve!();

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ data: "ok" });
    expect(r2).toEqual({ data: "ok" });
    expect(onRequest).toHaveBeenCalledTimes(2);
  });

  it("rejects all queued when refresh fails", async () => {
    onRefresh.mockRejectedValue(new Error("refresh expired"));

    const err1 = makeError({
      status: 401,
      config: { method: "get", url: "/a" },
    });
    const err2 = makeError({
      status: 401,
      config: { method: "get", url: "/b" },
    });

    const r1 = handler(err1);
    const r2 = handler(err2);

    await expect(r1).rejects.toBeDefined();
    await expect(r2).rejects.toBeDefined();
    expect(onRequest).not.toHaveBeenCalled();
  });

  it("rejects single request when refresh fails", async () => {
    onRefresh.mockRejectedValue(new Error("invalid token"));

    const err = makeError({
      status: 401,
      config: { method: "get", url: "/data" },
    });

    await expect(handler(err)).rejects.toThrow("invalid token");
  });

  /* ── No refresh on auth endpoints ────────────────────────────────────── */

  it("does not attempt refresh on /auth/refresh 401", async () => {
    const err = makeError({
      status: 401,
      config: { method: "post", url: "/auth/refresh" },
    });

    await expect(handler(err)).rejects.toBeDefined();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does not attempt refresh on /auth/complete 401", async () => {
    const err = makeError({
      status: 401,
      config: { method: "post", url: "/auth/complete" },
    });

    await expect(handler(err)).rejects.toBeDefined();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("does not attempt refresh on /auth/logout 401", async () => {
    const err = makeError({
      status: 401,
      config: { method: "post", url: "/auth/logout" },
    });

    await expect(handler(err)).rejects.toBeDefined();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  /* ── Non-401 errors pass through ─────────────────────────────────────── */

  it("passes through 500 without retry on POST", async () => {
    const err = makeError({
      status: 500,
      config: { method: "post", url: "/test" },
    });

    await expect(handler(err)).rejects.toBeDefined();
    expect(onRequest).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("passes through 403 without refresh", async () => {
    const err = makeError({
      status: 403,
      config: { method: "get", url: "/forbidden" },
    });

    await expect(handler(err)).rejects.toBeDefined();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("passes through non-401, non-retryable errors", async () => {
    const err = makeError({
      status: 404,
      config: { method: "get", url: "/missing" },
    });

    await expect(handler(err)).rejects.toBeDefined();
  });
});

/* ── Integration tests — full api instance with MockAdapter ────────────── */

describe("api integration", () => {
  let mock: MockAdapter;

  beforeEach(() => {
    _resetRefreshState();
    mock = new MockAdapter(api, { onNoMatch: "throwException" });
  });

  afterEach(() => {
    mock.reset();
  });

  /* ── 401 refresh happy path ───────────────────────────────────────────── */

  it("transparently refreshes and retries a protected GET on 401", async () => {
    let call = 0;
    mock.onGet("/protected-data").reply(() => {
      call++;
      if (call === 1) return [401, { error: "expired" }];
      return [200, { items: [1, 2, 3] }];
    });
    mock.onPost("/auth/refresh").reply(200, {});

    const { data } = await api.get("/protected-data");
    expect(data.items).toEqual([1, 2, 3]);
    expect(call).toBe(2);
  });

  it("transparently refreshes and retries a protected POST on 401", async () => {
    let call = 0;
    mock.onPost("/protected-action").reply(() => {
      call++;
      if (call === 1) return [401, { error: "expired" }];
      return [200, { success: true }];
    });
    mock.onPost("/auth/refresh").reply(200, {});

    const { data } = await api.post("/protected-action", { x: 1 });
    expect(data.success).toBe(true);
    expect(call).toBe(2);
  });

  it("multiple protected GETs after a single 401-induced refresh all succeed", async () => {
    let getA = 0;
    let getB = 0;

    mock.onGet("/resource/a").reply(() => {
      getA++;
      if (getA === 1) return [401, {}];
      return [200, { name: "a" }];
    });
    mock.onGet("/resource/b").reply(() => {
      getB++;
      if (getB === 1) return [401, {}];
      return [200, { name: "b" }];
    });
    mock.onPost("/auth/refresh").reply(200, {});

    const [a, b] = await Promise.all([api.get("/resource/a"), api.get("/resource/b")]);

    expect(a.data.name).toBe("a");
    expect(b.data.name).toBe("b");
    expect(getA).toBe(2);
    expect(getB).toBe(2);
  });

  it("survives back-to-back refresh cycles without mutation leaks", async () => {
    mock.onGet("/data-1").replyOnce(401).onGet("/data-1").replyOnce(200, { v: 1 });
    mock.onPost("/auth/refresh").replyOnce(200, {});

    const r1 = await api.get("/data-1");
    expect(r1.data.v).toBe(1);

    _resetRefreshState();
    mock.reset();
    mock = new MockAdapter(api, { onNoMatch: "throwException" });

    mock.onGet("/data-2").replyOnce(401).onGet("/data-2").replyOnce(200, { v: 2 });
    mock.onPost("/auth/refresh").replyOnce(200, {});

    const r2 = await api.get("/data-2");
    expect(r2.data.v).toBe(2);
  });

  it("does not tamper with non-401 non-timeout requests", async () => {
    mock.onGet("/plain").reply(200, { hello: "world" });
    const { data } = await api.get("/plain");
    expect(data.hello).toBe("world");
  });
});

/* ── Auth flow integration tests ───────────────────────────────────────── */

describe("auth repo flows via api instance", () => {
  let mock: MockAdapter;

  beforeEach(() => {
    _resetRefreshState();
    mock = new MockAdapter(api, { onNoMatch: "throwException" });
  });

  afterEach(() => {
    mock.reset();
  });

  describe("completeAuth (login) success", () => {
    it("POST /auth/complete returns user and sets cookies", async () => {
      mock.onPost("/auth/complete").reply(200, {
        userId: "user-x",
        email: "test@example.com",
        phone: null,
        roles: ["PLAYER"],
        eloSingles: 200,
        eloDoubles: 200,
        clubId: null,
      });

      const { data } = await api.post("/auth/complete", {
        provider: "google",
        input: { credential: "abc" },
      });
      expect(data.userId).toBe("user-x");
      expect(data.roles).toEqual(["PLAYER"]);
      expect(data.eloSingles).toBe(200);
      expect(data.eloDoubles).toBe(200);
    });

    it("POST /auth/complete for password login returns user", async () => {
      mock.onPost("/auth/complete").reply(200, {
        userId: "pw-1",
        email: "user@test.com",
        phone: null,
        roles: ["PLAYER"],
        eloSingles: 200,
        eloDoubles: 200,
        clubId: null,
      });

      const { data } = await api.post("/auth/complete", {
        provider: "password",
        input: { email: "user@test.com", password: "secret" },
      });
      expect(data.userId).toBe("pw-1");
      expect(data.email).toBe("user@test.com");
    });
  });

  describe("getCurrentUser (/me) success", () => {
    it("GET /auth/me returns current user data", async () => {
      mock.onGet("/auth/me").reply(200, {
        userId: "user-1",
        email: "user1@test.com",
        phone: null,
        roles: ["PLAYER", "COACH"],
        eloSingles: 210,
        eloDoubles: 195,
        clubId: "club-1",
      });

      const { data } = await api.get("/auth/me");
      expect(data.userId).toBe("user-1");
      expect(data.roles).toContain("COACH");
      expect(data.eloSingles).toBe(210);
      expect(data.clubId).toBe("club-1");
    });

    it("GET /auth/me retries transparently after refresh on 401", async () => {
      let meCalls = 0;
      mock.onGet("/auth/me").reply(() => {
        meCalls++;
        if (meCalls === 1) return [401, {}];
        return [200, { userId: "user-1", roles: ["PLAYER"], eloSingles: 200, eloDoubles: 200, email: null, phone: null, clubId: null }];
      });
      mock.onPost("/auth/refresh").reply(200, {});

      const { data } = await api.get("/auth/me");
      expect(data.userId).toBe("user-1");
      expect(meCalls).toBe(2);
    });
  });

  describe("logout success", () => {
    it("POST /auth/logout succeeds with 204", async () => {
      mock.onPost("/auth/logout").reply(204);
      const response = await api.post("/auth/logout");
      expect(response.status).toBe(204);
    });
  });
});
