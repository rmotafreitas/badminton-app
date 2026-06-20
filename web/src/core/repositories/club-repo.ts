import type { ClubRepo } from "@/core/repositories/interfaces/club-repo";
import type { Club } from "@/core/domain/club";
import type { ClubView } from "@/core/views/club.view";
import { ClubMapper } from "@/core/mappers/club-mapper";
import api from "@/lib/api";

export class ClubRepoImpl implements ClubRepo {
  async getById(id: string): Promise<Club> {
    const { data } = await api.get<ClubView>(`/clubs/${id}`);
    return ClubMapper.toDomain(data);
  }

  async getAll(): Promise<Club[]> {
    const { data } = await api.get<ClubView[]>("/clubs/admin/");
    return data.map(ClubMapper.toDomain);
  }

  async create(dto: { name: string; location?: string }): Promise<Club> {
    const { data } = await api.post<ClubView>("/clubs/admin/", dto);
    return ClubMapper.toDomain(data);
  }

  async update(id: string, dto: { name?: string; location?: string }): Promise<Club> {
    const { data } = await api.put<ClubView>(`/clubs/manage/${id}`, dto);
    return ClubMapper.toDomain(data);
  }

  async assignUser(userId: string, clubId: string): Promise<Club> {
    const { data } = await api.post<ClubView>("/clubs/admin/assign", { userId, clubId });
    return ClubMapper.toDomain(data);
  }

  async delete(id: string): Promise<void> {
    await api.delete(`/clubs/admin/${id}`);
  }
}
