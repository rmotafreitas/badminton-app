import { beforeAll, describe, expect, it } from "bun:test";
import { PrismaRallySessionRepository, PrismaUserRepository, S3ObjectStorage, sharpImageProcessor } from "@bb/infrastructure";
import { BusinessRuleViolation } from "@bb/domain";
import type { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { useIsolatedDatabase } from "./support";

const isolated = useIsolatedDatabase();
let db: PrismaClient;
beforeAll(() => {
  db = isolated.db;
});

describe("PrismaRallySessionRepository", () => {
  const recordedAt = new Date("2026-11-01T10:00:00Z");

  it("enforces one session per (owner, clientId)", async () => {
    const repo = new PrismaRallySessionRepository(db);
    const owner = await new PrismaUserRepository(db).create({ name: "O", provider: "password", providerId: "o" });
    const input = { ownerId: owner.id, clientId: "client-unique", title: null, recordedAt, durationS: 10, gameId: null, trainingDate: null };
    await repo.create(input);
    await expect(repo.create(input)).rejects.toThrow();
    expect((await repo.findByClientId(owner.id, "client-unique"))?.status).toBe("pending");
  });

  it("the analysis lock is a compare-and-set: one device wins, the lease expires, the holder renews", async () => {
    const repo = new PrismaRallySessionRepository(db);
    const owner = await new PrismaUserRepository(db).create({ name: "L", provider: "password", providerId: "l" });
    const s = await repo.create({ ownerId: owner.id, clientId: "client-lock", title: null, recordedAt, durationS: 10, gameId: null, trainingDate: null });
    const now = new Date();
    const until = new Date(now.getTime() + 600_000);
    const results = await Promise.all(["device-a", "device-b", "device-c"].map((d) => repo.acquireLock(s.id, d, until, now)));
    const winners = results.filter(Boolean);
    expect(winners).toHaveLength(1);
    const holder = winners[0]!.analysisLock!.deviceId;
    expect(await repo.acquireLock(s.id, holder, until, now)).not.toBeNull();
    const later = new Date(until.getTime() + 1000);
    expect((await repo.acquireLock(s.id, "device-z", new Date(later.getTime() + 600_000), later))?.analysisLock?.deviceId).toBe("device-z");
    await repo.update(s.id, { analysisLock: null });
    expect((await repo.findById(s.id))?.analysisLock).toBeNull();
    expect(await repo.acquireLock(s.id, "device-y", until, now)).not.toBeNull();
  });

  it("participants drive who sees a session; expired unpinned videos are found", async () => {
    const repo = new PrismaRallySessionRepository(db);
    const users = new PrismaUserRepository(db);
    const owner = await users.create({ name: "P1", provider: "password", providerId: "p1" });
    const mate = await users.create({ name: "P2", provider: "password", providerId: "p2" });
    const s = await repo.create({ ownerId: owner.id, clientId: "client-part", title: null, recordedAt, durationS: 10, gameId: null, trainingDate: null });
    await repo.update(s.id, {
      participants: [{ playerId: "P2", userId: mate.id }],
      summary: { stats: { shots: 3 } },
      videoKey: `sessions/${s.id}/review.mp4`,
      videoExpiresAt: new Date(Date.now() - 1000),
    });
    expect((await repo.findForUser(mate.id)).map((x) => x.id)).toContain(s.id);
    expect((await repo.findWithParticipant(mate.id))[0]?.summary).toEqual({ stats: { shots: 3 } });
    expect((await repo.findExpiredVideos(new Date())).map((x) => x.id)).toContain(s.id);
    await repo.update(s.id, { pinned: true });
    expect((await repo.findExpiredVideos(new Date())).map((x) => x.id)).not.toContain(s.id);
  });
});

const s3 =
  process.env.S3_ENDPOINT && process.env.S3_BUCKET
    ? new S3ObjectStorage({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION ?? "us-east-1",
        bucket: process.env.S3_BUCKET,
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      })
    : null;

describe.skipIf(!s3)("S3ObjectStorage (SeaweedFS)", () => {
  it("presigned PUT → presigned GET → delete, as the browser uses them", async () => {
    const key = `it/${crypto.randomUUID()}/review.mp4`;
    const body = new Uint8Array([0, 1, 2, 3, 250]);
    const put = await fetch(await s3!.presignPut(key, "video/mp4", 300), { method: "PUT", body, headers: { "content-type": "video/mp4" } });
    expect(put.ok).toBe(true);
    const get = await fetch(await s3!.presignGet(key, 300));
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(body);
    await s3!.delete(key);
    expect((await fetch(await s3!.presignGet(key, 300))).status).toBe(404);
    await s3!.delete(key); // deleting twice is fine
  });
});

describe("sharpImageProcessor", () => {
  it("re-encodes to WebP within bounds, versioned by content", async () => {
    const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#15803d" } }).png().toBuffer();
    const a = await sharpImageProcessor.toWebp(png, { maxWidth: 512, maxHeight: 512, quality: 70 });
    const b = await sharpImageProcessor.toWebp(png, { maxWidth: 512, maxHeight: 512, quality: 70 });
    expect(a.dataUrl.startsWith("data:image/webp;base64,")).toBe(true);
    expect(a.version).toBe(b.version);
    const meta = await sharp(Buffer.from(a.dataUrl.split(",")[1]!, "base64")).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 512, 256]);
  });

  it("refuses something that isn't an image", async () => {
    await expect(sharpImageProcessor.toWebp(new TextEncoder().encode("<script>"), { maxWidth: 10, maxHeight: 10, quality: 50 })).rejects.toBeInstanceOf(
      BusinessRuleViolation,
    );
  });
});
