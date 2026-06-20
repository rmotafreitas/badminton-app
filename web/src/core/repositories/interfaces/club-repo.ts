import type { Club } from "@/core/domain/club";

export interface ClubRepo {
  getById(id: string): Promise<Club>;
  getAll(): Promise<Club[]>;
  create(data: { name: string; location?: string }): Promise<Club>;
  update(id: string, data: { name?: string; location?: string }): Promise<Club>;
  assignUser(userId: string, clubId: string): Promise<Club>;
  delete(id: string): Promise<void>;
}
