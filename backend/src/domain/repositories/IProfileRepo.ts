import type { Profile } from "../entities/Profile";

export interface IProfileRepo {
  findByUserId(userId: string): Promise<Profile | null>;
  updateByUserId(userId: string, data: Partial<Profile>): Promise<Profile>;
}
