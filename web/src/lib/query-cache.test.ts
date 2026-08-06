import { describe, it, expect, beforeEach } from "vitest";
import { queryCache } from "@/lib/query-cache";

describe("query-cache error entry handling", () => {
  beforeEach(() => {
    queryCache.clear();
  });

  it("getSnapshot treats data=undefined entry as stale", () => {
    const key = ["test", "error-entry"] as const;
    const fetcher = () => Promise.reject(new Error("network"));
    // Trigger a failed fetch to create an error entry
    queryCache.read(key, fetcher, { staleTime: 60000 }).promise?.catch(() => {});

    const snap = queryCache.getSnapshot(key);
    expect(snap.data).toBeUndefined();
    expect(snap.isStale).toBe(true);
  });

  it("getSnapshot treats data=defined entry as fresh within staleTime", () => {
    const key = ["test", "fresh"] as const;
    queryCache.set(key, { value: 42 }, { staleTime: 60000 });

    const snap = queryCache.getSnapshot(key);
    expect(snap.data).toEqual({ value: 42 });
    expect(snap.isStale).toBe(false);
  });

  it("read triggers refetch when existing entry has data=undefined (not treated as fresh)", async () => {
    const key = ["test", "refetch"] as const;
    let callCount = 0;
    const fetcher = () => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error("fail"));
      return Promise.resolve({ ok: true });
    };

    // First read: fails, creates error entry
    const r1 = queryCache.read(key, fetcher, { staleTime: 60000 });
    await r1.promise?.catch(() => {});

    // Second read: entry exists with data=undefined, should trigger refetch
    // NOT be treated as "fresh" and serve undefined.
    const r2 = queryCache.read(key, fetcher, { staleTime: 60000 });
    expect(r2.data).toBeUndefined();
    expect(r2.promise).toBeDefined(); // a refetch is triggered

    await r2.promise;
    const snap = queryCache.getSnapshot(key);
    expect(snap.data).toEqual({ ok: true });
    expect(callCount).toBe(2);
  });

  it("read serves cached data as fresh when data is defined", () => {
    const key = ["test", "serve"] as const;
    queryCache.set(key, { value: 1 }, { staleTime: 60000 });

    const r = queryCache.read(key, () => Promise.resolve({ value: 2 }), {
      staleTime: 60000,
    });
    expect(r.data).toEqual({ value: 1 });
    expect(r.promise).toBeUndefined(); // no refetch within staleTime
  });

  it("read serves stale data and triggers background refetch after staleTime", async () => {
    const key = ["test", "swr"] as const;
    queryCache.set(key, { v: 1 }, { staleTime: 100, gcTime: 5000 });

    // Wait for it to become stale
    await new Promise((r) => setTimeout(r, 150));

    let callCount = 0;
    const r = queryCache.read(key, () => {
      callCount++;
      return Promise.resolve({ v: 2 });
    }, { staleTime: 100, gcTime: 5000 });

    expect(r.data).toEqual({ v: 1 }); // stale data served immediately
    expect(r.promise).toBeDefined(); // background refetch promise returned

    await r.promise;
    expect(callCount).toBe(1);
    expect(queryCache.getSnapshot(key).data).toEqual({ v: 2 });
  });

  it("clear removes all entries", () => {
    queryCache.set(["a"], 1);
    queryCache.set(["b"], 2);
    queryCache.clear();

    expect(queryCache.getSnapshot(["a"]).data).toBeUndefined();
    expect(queryCache.getSnapshot(["b"]).data).toBeUndefined();
  });
});