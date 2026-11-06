import type { RallySessionService, UpdateRallySessionInput } from "@/application/services/RallySessionService";
import { RallySessionMapper } from "@/application/mappers/RallySessionMapper";
import type { RallySessionView } from "@/application/views/rally-session.view";
import type { RallyFormat } from "@/domain/entities/RallySession";

type Me = { sub: string };

export class RallySessionController {
  constructor(private readonly service: RallySessionService) {}

  async create(me: Me, body: Parameters<RallySessionService["create"]>[1]): Promise<RallySessionView> {
    return RallySessionMapper.toView(await this.service.create(me.sub, body), "full");
  }

  async list(me: Me): Promise<RallySessionView[]> {
    const sessions = await this.service.listForUser(me.sub);
    return sessions.map((s) => RallySessionMapper.toView(s, "full"));
  }

  async listForGame(me: Me, gameId: string): Promise<RallySessionView[]> {
    const rows = await this.service.listForGame(gameId, me.sub);
    return rows.map(({ session, access }) => RallySessionMapper.toView(session, access === "full" ? "full" : "summary"));
  }

  async get(me: Me, id: string): Promise<RallySessionView> {
    const { session, access } = await this.service.getForViewer(id, me.sub);
    return RallySessionMapper.toView(session, access === "full" ? "full" : "summary");
  }

  async update(me: Me, id: string, body: UpdateRallySessionInput): Promise<RallySessionView> {
    return RallySessionMapper.toView(await this.service.update(id, me.sub, body), "full");
  }

  async leave(me: Me, id: string) {
    await this.service.leave(id, me.sub);
    return { success: true };
  }

  async delete(me: Me, id: string) {
    await this.service.delete(id, me.sub);
    return { success: true };
  }

  usage(me: Me) {
    return this.service.usage(me.sub);
  }

  requestVideoUpload(me: Me, id: string, body: { bytes: number; contentType: string }) {
    return this.service.requestVideoUpload(id, me.sub, body.bytes, body.contentType);
  }

  async completeVideoUpload(me: Me, id: string, body: { key: string; bytes: number }) {
    return RallySessionMapper.toView(await this.service.completeVideoUpload(id, me.sub, body.key, body.bytes), "full");
  }

  videoUrl(me: Me, id: string) {
    return this.service.videoUrl(id, me.sub);
  }

  acquireLock(me: Me, id: string, body: { deviceId: string }) {
    return this.service.acquireLock(id, me.sub, body.deviceId);
  }

  async releaseLock(me: Me, id: string, body: { deviceId: string; failed?: boolean }) {
    await this.service.releaseLock(id, me.sub, body.deviceId, body.failed);
    return { success: true };
  }

  requestResultUpload(me: Me, id: string) {
    return this.service.requestResultUpload(id, me.sub);
  }

  async submitResult(
    me: Me,
    id: string,
    body: { summary: unknown; format: RallyFormat; resultKey?: string | null; deviceId: string },
  ) {
    return RallySessionMapper.toView(await this.service.submitResult(id, me.sub, body), "full");
  }

  resultUrl(me: Me, id: string) {
    return this.service.resultUrl(id, me.sub);
  }

  async profile(me: Me, userId: string) {
    const rows = await this.service.sessionsForProfile(userId, me.sub);
    return rows.map(({ session, playerId }) => ({
      id: session.id,
      recordedAt: session.recordedAt,
      durationS: session.durationS,
      format: session.format,
      playerId,
      summary: session.summary,
    }));
  }

  async purge(authorization: string | undefined, secret: string | undefined) {
    if (!secret || authorization !== `Bearer ${secret}`) return { status: 401 as const };
    return { status: 200 as const, deleted: await this.service.purgeExpiredVideos() };
  }
}
