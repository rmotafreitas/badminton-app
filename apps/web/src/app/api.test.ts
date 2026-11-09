import { describe, expect, it, vi } from "vitest";
import { ApiError, createApi, isClientError, isUnavailable, NetworkError, unwrap } from "./api";
import { retryPolicy } from "./query-client";

describe("unwrap", () => {
  it("returns data, including a legitimate null", () => {
    expect(unwrap({ data: { a: 1 }, error: null, response: new Response() })).toEqual({ a: 1 });
    expect(unwrap({ data: null, error: null, response: new Response() })).toBeNull();
  });

  it("turns an error body into ApiError(status, code)", () => {
    const run = () =>
      unwrap({
        data: null,
        error: { status: 429, value: { code: "rate_limited", message: "Slow down", requestId: "r1", retryAfterSeconds: 30 } },
        response: new Response(null, { status: 429 }),
      });
    expect(run).toThrow(ApiError);
    try {
      run();
    } catch (e) {
      expect(e).toMatchObject({ status: 429, code: "rate_limited", message: "Slow down", requestId: "r1", retryAfterSeconds: 30 });
    }
  });

  it("a non-JSON error page still becomes an ApiError", () => {
    expect(() => unwrap({ data: null, error: { status: 502, value: "<html>Bad gateway</html>" }, response: new Response(null, { status: 502 }) })).toThrow(
      /HTTP 502/,
    );
  });

  it("no response at all is a NetworkError (never a logout)", () => {
    expect(() => unwrap({ data: null, error: { status: 503, value: new TypeError("fetch failed") }, response: undefined })).toThrow(NetworkError);
  });
});

describe("error classes", () => {
  it("classifies definite answers and outages", () => {
    expect(isClientError(new ApiError(404, "not_found", ""))).toBe(true);
    expect(isClientError(new ApiError(429, "rate_limited", ""))).toBe(false);
    expect(isUnavailable(new ApiError(500, "internal", ""))).toBe(true);
    expect(isUnavailable(new NetworkError())).toBe(true);
    expect(isUnavailable(new ApiError(401, "unauthenticated", ""))).toBe(false);
  });

  it("retries outages and throttles, never definite 4xx answers, at most 3 times", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(retryPolicy(0, new ApiError(403, "forbidden", ""))).toBe(false);
    expect(retryPolicy(0, new ApiError(429, "rate_limited", ""))).toBe(true);
    expect(retryPolicy(2, new ApiError(503, "x", ""))).toBe(true);
    expect(retryPolicy(3, new ApiError(503, "x", ""))).toBe(false);
    vi.stubGlobal("navigator", { onLine: false });
    expect(retryPolicy(0, new NetworkError())).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("createApi", () => {
  const recorder = () => {
    const calls: { url: string; method: string; contentType: string | null }[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(input), method: init?.method ?? "GET", contentType: headers.get("content-type") });
      return new Response("null", { headers: { "content-type": "application/json" } });
    });
    return { calls, fetcher };
  };

  it("sends JSON content-type on bodiless writes (the CSRF guard needs it) and never on reads", async () => {
    const { calls, fetcher } = recorder();
    const api = createApi(fetcher, "https://app.test");
    await api.auth.session.get();
    await api.games({ id: "0000000000000000000000aa" }).delete();
    await api.auth["sign-out"].post();
    expect(calls.map((c) => [c.method, c.contentType])).toEqual([
      ["GET", null],
      ["DELETE", "application/json"],
      ["POST", "application/json"],
    ]);
    expect(calls[0]?.url).toBe("https://app.test/api/auth/session");
  });

  it("keeps ISO dates as strings (the contract's type), not Date objects", async () => {
    const fetcher = async () =>
      new Response(JSON.stringify({ user: null, at: "2026-11-06T10:00:00.000Z" }), { headers: { "content-type": "application/json" } });
    const { data } = await createApi(fetcher, "https://app.test").auth.session.get();
    expect(typeof (data as unknown as { at: unknown }).at).toBe("string");
  });
});
