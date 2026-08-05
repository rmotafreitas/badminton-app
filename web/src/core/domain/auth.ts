import type { Role } from "@/core/domain/roles";

export type AuthProvider = "google" | "email" | "email-code" | "phone" | "password";

export interface AuthUserInfo {
  userId: string;
  roles: Role[];
  eloSingles: number;
  eloDoubles: number;
  email: string | null;
  phone: string | null;
  clubId: string | null;
}

export interface AuthInitResult {
  type: "redirect" | "code-sent";
  redirectUrl?: string;
  message: string;
}
