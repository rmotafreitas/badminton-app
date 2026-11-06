import { beforeEach, describe, expect, it } from "bun:test";
import { RALLY_LIMITS, RallySessionService } from "../../src/application/services/RallySessionService";
import type { IRallySessionRepo, RallySessionPatch } from "../../src/domain/repositories/IRallySessionRepo";
import type { IUserRepo } from "../../src/domain/repositories/IUserRepo";
import type { IObjectStorage } from "../../src/application/interfaces/IObjectStorage";
import type { RallySession } from "../../src/domain/entities/RallySession";
import type { User } from "../../src/domain/entities/User";
import { RallySessionMapper } from "../../src/application/mappers/RallySessionMapper";

function memoryRepo(): IRallySessionRepo {
  const rows = new Map<string, RallySession>();
  let n = 0;
  const id = () => (++n).toString(16).padStart(24, "0");
  return {
    async create(d) {
      const s: RallySession = {
        id: id(),
        ownerId: d.ownerId,
        clientId: d.clientId,
        title: d.title ?? null,
        recordedAt: d.recordedAt,
        durationS: d.durationS,
        status: "pending",
        format: null,
        gameId: d.gameId ?? null,
        trainingDate: d.trainingDate ?? null,
        participants: [],
        videoKey: null,
        videoBytes: null,
        videoUploadedAt: null,
        videoExpiresAt: null,
        pinned: false,
        resultKey: null,
        summary: null,
        corrections: null,
        analysisLock: null,
        shareForTraining: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      rows.set(s.id, s);
      return s;
    },
    findById: async (i) => rows.get(i) ?? null,
    findByClientId: async (o, c) => [...rows.values()].find((s) => s.ownerId === o && s.clientId === c) ?? null,
    findForUser: async (u) =>
      [...rows.values()].filter((s) => s.ownerId === u || s.participants.some((p) => p.userId === u)),
    findWithParticipant: async (u) => [...rows.values()].filter((s) => s.participants.some((p) => p.userId === u)),
    findByGameId: async (g) => [...rows.values()].filter((s) => s.gameId === g),
    findExpiredVideos: async (now) =>
      [...rows.values()].filter((s) => !s.pinned && s.videoKey && s.videoExpiresAt && s.videoExpiresAt < now),
    async update(i, patch: RallySessionPatch) {
      const s = { ...rows.get(i)!, ...patch, updatedAt: new Date() };
      rows.set(i, s);
      return s;
    },
    async acquireLock(i, deviceId, until, now) {
      const s = rows.get(i)!;
      const l = s.analysisLock;
      if (l && l.until >= now && l.deviceId !== deviceId) return null;
      const next = { ...s, analysisLock: { deviceId, until } };
      rows.set(i, next);
      return next;
    },
    delete: async (i) => void rows.delete(i),
  };
}

function users(): IUserRepo {
  const u = (id: string, clubId: string | null): User =>
    ({ id, clubId, roles: ["PLAYER"], email: null, phone: null } as unknown as User);
  const all: Record<string, User> = {
    owner: u("owner", "club-a"),
    mate: u("mate", "club-a"),
    partner: u("partner", "club-b"),
    stranger: u("stranger", "club-z"),
  };
  return {
    findById: async (id: string) => all[id] ?? null,
    findByIds: async (ids: string[]) => ids.map((i) => all[i]).filter(Boolean) as User[],
  } as unknown as IUserRepo;
}

function storage(): IObjectStorage & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    configured: true,
    deleted,
    presignPut: async (k) => `https://s3.test/${k}?put`,
    presignGet: async (k) => `https://s3.test/${k}?get`,
    delete: async (k) => void deleted.push(k),
  };
}

describe("RallySessionService", () => {
  let now = new Date("2026-11-06T10:00:00Z");
  let repo: IRallySessionRepo;
  let store: ReturnType<typeof storage>;
  let svc: RallySessionService;
  const create = (owner = "owner", clientId = "client-0001") =>
    svc.create(owner, { clientId, recordedAt: now.toISOString(), durationS: 42 });

  beforeEach(() => {
    now = new Date("2026-11-06T10:00:00Z");
    repo = memoryRepo();
    store = storage();
    svc = new RallySessionService(repo, users(), store, () => now);
  });

  it("creates idempotently on clientId (offline sync retries)", async () => {
    const a = await create();
    const b = await create();
    expect(b.id).toBe(a.id);
    expect((await svc.listForUser("owner")).length).toBe(1);
  });

  it("validates input", async () => {
    await expect(svc.create("owner", { clientId: "x", recordedAt: now.toISOString(), durationS: 1 })).rejects.toThrow();
    await expect(create("owner", "has spaces in it")).rejects.toThrow();
  });

  it("grants full access to owner and linked players, summary to club-mates, none to others", async () => {
    const s = await create();
    await svc.update(s.id, "owner", { participants: [{ playerId: "P3", userId: "partner" }] });
    const fresh = (await repo.findById(s.id))!;
    expect(await svc.accessFor(fresh, "owner")).toBe("full");
    expect(await svc.accessFor(fresh, "partner")).toBe("full");
    expect(await svc.accessFor(fresh, "mate")).toBe("summary");
    expect(await svc.accessFor(fresh, "stranger")).toBe("none");
    await expect(svc.getForViewer(s.id, "stranger")).rejects.toThrow("not found");
    await expect(svc.videoUrl(s.id, "mate")).rejects.toThrow("private");
  });

  it("only the owner edits; a linked player can leave", async () => {
    const s = await create();
    await svc.update(s.id, "owner", { participants: [{ playerId: "P1", userId: "partner" }] });
    await expect(svc.update(s.id, "partner", { title: "hack" })).rejects.toThrow("owner");
    await svc.leave(s.id, "partner");
    expect((await repo.findById(s.id))!.participants).toEqual([]);
  });

  it("rejects bad participant mappings", async () => {
    const s = await create();
    await expect(
      svc.update(s.id, "owner", { participants: [{ playerId: "P9", userId: "partner" }] }),
    ).rejects.toThrow("playerId");
    await expect(
      svc.update(s.id, "owner", { participants: [{ playerId: "P1", userId: "ghost" }] }),
    ).rejects.toThrow("Unknown user");
  });

  it("caps the size of stored corrections", async () => {
    const s = await create();
    const huge = { shots: Object.fromEntries(Array.from({ length: 20000 }, (_, i) => [`r1s${i}`, { type: "smash" }])) };
    await expect(svc.update(s.id, "owner", { corrections: huge })).rejects.toThrow("too large");
    await svc.update(s.id, "owner", { corrections: { shots: { r1s1: { type: "clear" } } } });
  });

  it("limits pins", async () => {
    for (let i = 0; i < RALLY_LIMITS.maxPins; i++) {
      const s = await create("owner", `client-pin-${i}`);
      await svc.update(s.id, "owner", { pinned: true });
    }
    const extra = await create("owner", "client-pin-extra");
    await expect(svc.update(extra.id, "owner", { pinned: true })).rejects.toThrow("pin up to");
  });

  it("presigns uploads, enforces the quota and sets retention", async () => {
    const s = await create();
    const up = await svc.requestVideoUpload(s.id, "owner", 50_000_000, "video/mp4");
    expect(up.url).toContain(`sessions/${s.id}/review.mp4`);
    const done = await svc.completeVideoUpload(s.id, "owner", up.key, 50_000_000);
    expect(done.videoExpiresAt!.getTime() - now.getTime()).toBe(RALLY_LIMITS.videoRetentionDays * 86400_000);
    await expect(svc.requestVideoUpload(s.id, "owner", 10, "application/x-sh")).rejects.toThrow("type");
    const big = await create("owner", "client-big-01");
    await expect(
      svc.requestVideoUpload(big.id, "owner", RALLY_LIMITS.quotaBytes * 1.2, "video/mp4"),
    ).rejects.toThrow("Storage full");
    await expect(svc.completeVideoUpload(s.id, "owner", "sessions/other/x.mp4", 1)).rejects.toThrow("key");
  });

  it("lets exactly one device analyse at a time", async () => {
    const s = await create();
    await svc.acquireLock(s.id, "owner", "device-aaaa");
    await expect(svc.acquireLock(s.id, "owner", "device-bbbb")).rejects.toThrow("Another device");
    await svc.acquireLock(s.id, "owner", "device-aaaa"); // renew
    now = new Date(now.getTime() + (RALLY_LIMITS.lockMinutes + 1) * 60_000); // lease expired
    await svc.acquireLock(s.id, "owner", "device-bbbb");
    await expect(
      svc.submitResult(s.id, "owner", { summary: {}, format: "doubles", deviceId: "device-aaaa" }),
    ).rejects.toThrow("lock");
    const done = await svc.submitResult(s.id, "owner", { summary: { shots: 3 }, format: "doubles", deviceId: "device-bbbb" });
    expect(done.status).toBe("analysed");
    expect(done.analysisLock).toBeNull();
  });

  it("purges expired unpinned videos but keeps stats", async () => {
    const a = await create("owner", "client-old-01");
    const b = await create("owner", "client-pinned");
    for (const s of [a, b]) {
      const up = await svc.requestVideoUpload(s.id, "owner", 1000, "video/mp4");
      await svc.completeVideoUpload(s.id, "owner", up.key, 1000);
      await svc.submitResult(s.id, "owner", { summary: { shots: 1 }, format: "singles", deviceId: "device-x1" });
    }
    await svc.update(b.id, "owner", { pinned: true });
    now = new Date(now.getTime() + (RALLY_LIMITS.videoRetentionDays + 1) * 86400_000);
    expect(await svc.purgeExpiredVideos()).toBe(1);
    expect(store.deleted).toEqual([`sessions/${a.id}/review.mp4`]);
    const after = (await repo.findById(a.id))!;
    expect(after.videoKey).toBeNull();
    expect(after.summary).toEqual({ shots: 1 });
  });

  it("deletes the session's files on delete", async () => {
    const s = await create();
    const up = await svc.requestVideoUpload(s.id, "owner", 1000, "video/mp4");
    await svc.completeVideoUpload(s.id, "owner", up.key, 1000);
    await svc.delete(s.id, "owner");
    expect(store.deleted).toContain(up.key);
    expect(await repo.findById(s.id)).toBeNull();
  });
});

describe("RallySessionMapper.toView", () => {
  const session = (patch: Partial<RallySession>): RallySession =>
    ({
      id: "s1",
      ownerId: "u1",
      clientId: "c1",
      title: null,
      recordedAt: new Date(0),
      durationS: 30,
      status: "pending",
      format: null,
      gameId: null,
      trainingDate: null,
      participants: [],
      videoKey: null,
      videoBytes: null,
      videoUploadedAt: null,
      videoExpiresAt: null,
      pinned: false,
      resultKey: null,
      summary: null,
      corrections: null,
      analysisLock: null,
      shareForTraining: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      ...patch,
    }) as RallySession;
  const now = new Date("2026-11-06T12:00:00Z");

  it("reports an abandoned analysis (lease expired) as pending", () => {
    const s = session({ status: "analysing", analysisLock: { deviceId: "d", until: new Date(now.getTime() - 1000) } });
    expect(RallySessionMapper.toView(s, "full", now).status).toBe("pending");
    expect(RallySessionMapper.toView(session({ status: "analysing" }), "summary", now).status).toBe("pending");
  });

  it("keeps a live analysis and other states as they are", () => {
    const live = session({ status: "analysing", analysisLock: { deviceId: "d", until: new Date(now.getTime() + 60_000) } });
    expect(RallySessionMapper.toView(live, "full", now).status).toBe("analysing");
    expect(RallySessionMapper.toView(session({ status: "analysed" }), "full", now).status).toBe("analysed");
  });
});
