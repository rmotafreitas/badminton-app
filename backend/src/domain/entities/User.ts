export type Role = "SYSTEM_ADMIN" | "CLUB_ADMIN" | "COACH" | "PLAYER";

export type AuthProvider = "google" | "email" | "email-code" | "phone" | "password";

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  passwordHash: string | null;
  roles: Role[];
  elo: number;
  isActive: boolean;
  lastAccess: Date | null;
  clubId: string | null;
  createdAt: Date;
  updatedAt: Date;
  profile?: { name: string; photo: string | null } | null;
}

export interface AuthMethod {
  id: string;
  userId: string;
  provider: AuthProvider;
  providerId: string;
  createdAt: Date;
}
