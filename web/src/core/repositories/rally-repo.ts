import type { RallyRepo } from "@/core/repositories/interfaces/rally-repo";
import type {
  CreateRallySessionParams,
  PresignedUpload,
  RallyFormat,
  RallyProfileEntry,
  RallySession,
  RallySummary,
  UpdateRallySessionParams,
} from "@/core/domain/rally";
import { RallyMapper } from "@/core/mappers/rally-mapper";
import api from "@/lib/api";

const BASE = "/rally-sessions";

export class RallyRepoImpl implements RallyRepo {
  async create(params: CreateRallySessionParams): Promise<RallySession> {
    const { data } = await api.post(BASE, params);
    return RallyMapper.toDomain(data);
  }

  async list(): Promise<RallySession[]> {
    const { data } = await api.get<unknown[]>(BASE);
    return data.map((d) => RallyMapper.toDomain(d as never));
  }

  async get(id: string): Promise<RallySession> {
    const { data } = await api.get(`${BASE}/${id}`);
    return RallyMapper.toDomain(data);
  }

  async listForGame(gameId: string): Promise<RallySession[]> {
    const { data } = await api.get<unknown[]>(`${BASE}/game/${gameId}`);
    return data.map((d) => RallyMapper.toDomain(d as never));
  }

  async profile(userId: string): Promise<RallyProfileEntry[]> {
    const { data } = await api.get<(RallyProfileEntry & { recordedAt: string })[]>(`${BASE}/profile/${userId}`);
    return data.map((d) => ({ ...d, recordedAt: new Date(d.recordedAt) }));
  }

  async update(id: string, params: UpdateRallySessionParams): Promise<RallySession> {
    const { data } = await api.patch(`${BASE}/${id}`, params);
    return RallyMapper.toDomain(data);
  }

  async delete(id: string): Promise<void> {
    await api.delete(`${BASE}/${id}`);
  }

  async leave(id: string): Promise<void> {
    await api.delete(`${BASE}/${id}/participants/me`);
  }

  async usage() {
    const { data } = await api.get<{ usedBytes: number; limitBytes: number }>(`${BASE}/usage`);
    return data;
  }

  async requestVideoUpload(id: string, bytes: number, contentType: string): Promise<PresignedUpload> {
    const { data } = await api.post<PresignedUpload>(`${BASE}/${id}/video-upload`, { bytes, contentType });
    return data;
  }

  async completeVideoUpload(id: string, key: string, bytes: number): Promise<RallySession> {
    const { data } = await api.post(`${BASE}/${id}/video-complete`, { key, bytes });
    return RallyMapper.toDomain(data);
  }

  async videoUrl(id: string) {
    const { data } = await api.get<{ url: string; expiresAt: string | null }>(`${BASE}/${id}/video-url`);
    return { url: data.url, expiresAt: data.expiresAt ? new Date(data.expiresAt) : null };
  }

  async lock(id: string, deviceId: string) {
    const { data } = await api.post<{ deviceId: string; until: string }>(`${BASE}/${id}/lock`, { deviceId });
    return { deviceId: data.deviceId, until: new Date(data.until) };
  }

  async unlock(id: string, deviceId: string, failed?: boolean): Promise<void> {
    await api.post(`${BASE}/${id}/unlock`, { deviceId, failed });
  }

  async requestResultUpload(id: string): Promise<PresignedUpload | null> {
    const { data } = await api.post<PresignedUpload | null>(`${BASE}/${id}/result-upload`);
    return data ?? null;
  }

  async submitResult(
    id: string,
    body: { summary: RallySummary; format: RallyFormat; resultKey?: string | null; deviceId: string },
  ): Promise<RallySession> {
    const { data } = await api.post(`${BASE}/${id}/result`, body);
    return RallyMapper.toDomain(data);
  }

  async resultUrl(id: string) {
    const { data } = await api.get<{ url: string }>(`${BASE}/${id}/result-url`);
    return data;
  }
}
