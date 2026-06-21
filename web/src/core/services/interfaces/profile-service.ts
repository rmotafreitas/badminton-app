import type { Profile } from "@/core/domain/profile";

export interface ProfileService {
  getMyProfile(): Promise<Profile>;
  getProfile(userId: string): Promise<Profile>;
  updateMyProfile(data: {
    name?: string;
    birthday?: string;
    sex?: string;
    bio?: string;
    photo?: File | null;
    banner?: File | null;
  }): Promise<Profile>;
}
