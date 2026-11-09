import { describe, expect, it } from "bun:test";
import { RALLY_LIMITS } from "@bb/domain";
import { testApi } from "../support";

function setup(options: Parameters<typeof testApi>[0] = {}) {
  const api = testApi(options);
  const clubA = api.store.addClub("A");
  const clubB = api.store.addClub("B");
  const owner = api.store.addUser({ name: "Owner", clubId: clubA.id });
  const mate = api.store.addUser({ name: "Mate", clubId: clubA.id });
  const partner = api.store.addUser({ name: "Partner", clubId: clubB.id });
  const stranger = api.store.addUser({ name: "Stranger" });
  const me = api.as(owner);
  const create = async (clientId = "client-0001") =>
    (await me["rally-sessions"].post({ clientId, recordedAt: api.clock.now().toISOString(), durationS: 42 })).data!;
  return { api, owner, mate, partner, stranger, me, create };
}

describe("rally sessions", () => {
  it("creates idempotently on clientId (offline sync retries)", async () => {
    const { me, create } = setup();
    const a = await create();
    const b = await create();
    expect(b.id).toBe(a.id);
    expect((await me["rally-sessions"].get()).data).toHaveLength(1);
  });

  it("validates input", async () => {
    const { api, me } = setup();
    const bad = await me["rally-sessions"].post({ clientId: "has spaces in it", recordedAt: api.clock.now().toISOString(), durationS: 1 });
    expect(bad.status).toBe(422);
  });

  it("full access for owner and linked players, summary for club-mates, 404 for others", async () => {
    const { api, mate, partner, stranger, me, create } = setup();
    const s = await create();
    await me["rally-sessions"]({ id: s.id }).patch({ participants: [{ playerId: "P3", userId: partner.id }], corrections: { a: 1 } });
    expect((await api.as(partner)["rally-sessions"]({ id: s.id }).get()).data).toMatchObject({ access: "full", corrections: { a: 1 } });
    const summary = (await api.as(mate)["rally-sessions"]({ id: s.id }).get()).data!;
    expect(summary.access).toBe("summary");
    expect(summary.corrections).toBeUndefined();
    expect((await api.as(stranger)["rally-sessions"]({ id: s.id }).get()).status).toBe(404);
    expect((await api.as(mate)["rally-sessions"]({ id: s.id })["video-url"].get()).status).toBe(403);
  });

  it("only the owner edits; a linked player can leave", async () => {
    const { api, partner, me, create } = setup();
    const s = await create();
    await me["rally-sessions"]({ id: s.id }).patch({ participants: [{ playerId: "P1", userId: partner.id }] });
    const asPartner = api.as(partner)["rally-sessions"]({ id: s.id });
    expect((await asPartner.patch({ title: "hack" })).status).toBe(403);
    expect((await asPartner.participants.me.delete()).status).toBe(204);
    expect(api.store.rally.get(s.id)!.participants).toEqual([]);
  });

  it("rejects bad participant mappings and oversized corrections", async () => {
    const { partner, me, create } = setup();
    const s = await create();
    const session = me["rally-sessions"]({ id: s.id });
    expect((await session.patch({ participants: [{ playerId: "P9", userId: partner.id }] })).status).toBe(422);
    expect((await session.patch({ participants: [{ playerId: "P1", userId: "0000000000000000000000ff" }] })).status).toBe(422);
    const huge = { shots: Object.fromEntries(Array.from({ length: 20000 }, (_, i) => [`r1s${i}`, { type: "smash" }])) };
    expect((await session.patch({ corrections: huge })).status).toBe(422);
  });

  it("limits pins", async () => {
    const { me, create } = setup();
    for (let i = 0; i < RALLY_LIMITS.maxPins; i++) {
      const s = await create(`client-pin-${i}`);
      expect((await me["rally-sessions"]({ id: s.id }).patch({ pinned: true })).status).toBe(200);
    }
    const extra = await create("client-pin-extra");
    expect((await me["rally-sessions"]({ id: extra.id }).patch({ pinned: true })).status).toBe(409);
  });

  it("presigns uploads, enforces the quota and sets retention", async () => {
    const { me, create } = setup();
    const s = await create();
    const session = me["rally-sessions"]({ id: s.id });
    const up = (await session["video-upload"].post({ bytes: 50_000_000, contentType: "video/mp4" })).data!;
    expect(up.url).toContain(`sessions/${s.id}/review.mp4`);
    const done = (await session["video-complete"].post({ key: up.key, bytes: 50_000_000 })).data!;
    expect(new Date(done.videoExpiresAt!).getTime() - new Date(done.updatedAt).getTime()).toBe(RALLY_LIMITS.videoRetentionDays * 86_400_000);
    expect((await session["video-upload"].post({ bytes: 10, contentType: "application/x-sh" })).status).toBe(422);
    const big = await create("client-big-01");
    expect((await me["rally-sessions"]({ id: big.id })["video-upload"].post({ bytes: RALLY_LIMITS.quotaBytes * 1.2, contentType: "video/mp4" })).status).toBe(413);
    expect((await session["video-complete"].post({ key: "sessions/other/x.mp4", bytes: 1 })).status).toBe(422);
  });

  it("refuses video uploads when no bucket is configured", async () => {
    const { me, create } = setup({ storageConfigured: false });
    const s = await create();
    expect((await me["rally-sessions"]({ id: s.id })["video-upload"].post({ bytes: 1000, contentType: "video/mp4" })).status).toBe(409);
  });

  it("lets exactly one device analyse at a time; a dead device's lease shows as pending", async () => {
    const { api, me, create } = setup();
    const s = await create();
    const session = me["rally-sessions"]({ id: s.id });
    expect((await session.lock.post({ deviceId: "device-aaaa" })).status).toBe(200);
    expect((await session.lock.post({ deviceId: "device-bbbb" })).status).toBe(409);
    expect((await session.get()).data?.status).toBe("analysing");
    api.clock.advance((RALLY_LIMITS.lockMinutes + 1) * 60_000);
    expect((await session.get()).data?.status).toBe("pending");
    expect((await session.lock.post({ deviceId: "device-bbbb" })).status).toBe(200);
    expect((await session.result.post({ summary: {}, format: "doubles", deviceId: "device-aaaa" })).status).toBe(409);
    const done = (await session.result.post({ summary: { shots: 3 }, format: "doubles", deviceId: "device-bbbb" })).data!;
    expect(done).toMatchObject({ status: "analysed", analysisLock: null });
  });

  it("the cron purges expired unpinned videos but keeps stats; it needs the secret", async () => {
    const { api, me, create } = setup({ cronSecret: "cron-secret" });
    const a = await create("client-old-01");
    const b = await create("client-pinned");
    for (const s of [a, b]) {
      const session = me["rally-sessions"]({ id: s.id });
      const up = (await session["video-upload"].post({ bytes: 1000, contentType: "video/mp4" })).data!;
      await session["video-complete"].post({ key: up.key, bytes: 1000 });
      await session.result.post({ summary: { shots: 1 }, format: "singles", deviceId: "device-x1" });
    }
    await me["rally-sessions"]({ id: b.id }).patch({ pinned: true });
    api.clock.advance((RALLY_LIMITS.videoRetentionDays + 1) * 86_400_000);
    expect((await api.request("/api/rally-sessions/maintenance/purge-videos")).status).toBe(401);
    const res = await api.request("/api/rally-sessions/maintenance/purge-videos", { headers: { authorization: "Bearer cron-secret" } });
    expect((await res.json()) as any).toEqual({ deleted: 1 });
    expect(api.store.deletedObjects).toEqual([`sessions/${a.id}/review.mp4`]);
    expect(api.store.rally.get(a.id)).toMatchObject({ videoKey: null, summary: { shots: 1 } });
  });

  it("deletes the session's files on delete", async () => {
    const { api, me, create } = setup();
    const s = await create();
    const session = me["rally-sessions"]({ id: s.id });
    const up = (await session["video-upload"].post({ bytes: 1000, contentType: "video/mp4" })).data!;
    await session["video-complete"].post({ key: up.key, bytes: 1000 });
    expect((await session.delete()).status).toBe(204);
    expect(api.store.deletedObjects).toContain(up.key);
    expect(api.store.rally.has(s.id)).toBe(false);
  });

  it("profile stats list analysed sessions the player took part in", async () => {
    const { api, owner, partner, me, create } = setup();
    const s = await create();
    await me["rally-sessions"]({ id: s.id }).patch({ participants: [{ playerId: "P2", userId: partner.id }] });
    await me["rally-sessions"]({ id: s.id }).result.post({ summary: { shots: 9 }, format: "singles", deviceId: "device-x1" });
    const rows = (await api.as(owner)["rally-sessions"].profile({ userId: partner.id }).get()).data!;
    expect(rows).toEqual([expect.objectContaining({ id: s.id, playerId: "P2", summary: { shots: 9 } })]);
  });
});
