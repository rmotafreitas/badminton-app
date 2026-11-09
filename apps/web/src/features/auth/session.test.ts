// @vitest-environment happy-dom
import type { SessionUser } from "@bb/contracts";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Api } from "@/app/api";
import type { AppContext } from "@/app/context";
import { sessionKey } from "./api";
import { loadAuth, sessionRevalidated, startSession } from "./session";
import { sessionSnapshot } from "./snapshot";

const ana: SessionUser = {
  id: "0000000000000000000000aa",
  name: "Ana",
  email: "ana@test.pt",
  phone: null,
  roles: ["PLAYER"],
  clubId: null,
  eloSingles: 200,
  eloDoubles: 200,
  photoUrl: null,
};

/** An API whose session check answers when the test says so (a cold start). */
function slowApi() {
  const answers: ((user: SessionUser | null) => void)[] = [];
  const api = {
    auth: {
      session: {
        get: () =>
          new Promise((resolve) => answers.push((user) => resolve({ data: user ? { user } : null, error: null, response: new Response() }))),
      },
    },
  } as unknown as Api;
  return { api, answer: (user: SessionUser | null) => answers.splice(0).forEach((a) => a(user)) };
}

function context(api: Api, attach: () => Promise<void> = async () => undefined): AppContext {
  return {
    api,
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    persistence: { userId: undefined, attach: vi.fn(attach), wipe: vi.fn(async () => undefined) },
  };
}

describe("loadAuth on a cold start", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("a returning user starts from the snapshot after the cached pages are restored, without waiting for the API", async () => {
    sessionSnapshot.save(ana);
    const { api } = slowApi();
    let restored = false;
    const ctx = context(api, async () => {
      restored = true;
    });
    const state = await loadAuth(ctx);
    expect(state).toEqual({ kind: "signed-in", user: ana });
    expect(restored).toBe(true);
  });

  it("a broken IndexedDB delays the first paint by half a second at most", async () => {
    sessionSnapshot.save(ana);
    const ctx = context(slowApi().api, () => new Promise(() => undefined));
    const pending = loadAuth(ctx);
    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toEqual({ kind: "signed-in", user: ana });
  });

  it("nobody known on this device: the login page shows after 1.5 s even if the API is still waking up", async () => {
    const { api, answer } = slowApi();
    const ctx = context(api);
    const pending = loadAuth(ctx);
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(pending).resolves.toEqual({ kind: "anonymous" });

    // The late answer names someone (a cookie without a snapshot): the router hears "appeared", binds them and
    // re-runs the guards.
    answer(ana);
    await vi.advanceTimersByTimeAsync(10);
    expect(ctx.queryClient.getQueryData(sessionKey)).toEqual(ana);
    await expect(sessionRevalidated(ctx, ana)).resolves.toBe("appeared");
    expect(ctx.persistence.attach).toHaveBeenCalledWith(ctx.queryClient, ana.id);
  });

  it("a quick answer is used as is", async () => {
    const { api, answer } = slowApi();
    const ctx = context(api);
    const pending = loadAuth(ctx);
    answer(null);
    await expect(pending).resolves.toEqual({ kind: "anonymous" });
  });
});

describe("sessionRevalidated", () => {
  beforeEach(() => localStorage.clear());

  it("tells the router what changed", async () => {
    const ctx = context(slowApi().api);
    await expect(sessionRevalidated(ctx, null)).resolves.toBe(null);
    await expect(sessionRevalidated(ctx, ana)).resolves.toBe("appeared");
    expect(sessionSnapshot.read()).toEqual(ana);
    await expect(sessionRevalidated(ctx, { ...ana, name: "Ana M." })).resolves.toBe(null);
    expect(sessionSnapshot.read()?.name).toBe("Ana M.");
    await expect(sessionRevalidated(ctx, null)).resolves.toBe("expired");
  });
});

describe("startSession", () => {
  beforeEach(() => localStorage.clear());

  it("a session check sent before signing in can't sign the user out when it lands late", async () => {
    const { api, answer } = slowApi();
    const ctx = context(api);
    void ctx.queryClient.fetchQuery({ queryKey: sessionKey, queryFn: () => api.auth.session.get().then((r) => r.data?.user ?? null) }).catch(() => undefined);
    await startSession(ctx, ana);
    answer(null);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(ctx.queryClient.getQueryData(sessionKey)).toEqual(ana);
  });
});
