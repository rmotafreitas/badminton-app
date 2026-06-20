import type { Club } from "../entities/Club";

export interface IClubRepo {
  create(data: {
    name: string;
    location?: string;
    profilePicture?: string;
    banner?: string;
  }): Promise<Club>;
  update(id: string, data: Partial<Club>): Promise<Club>;
  findById(id: string): Promise<Club | null>;
  findAll(): Promise<Club[]>;
  delete(id: string): Promise<void>;
}
