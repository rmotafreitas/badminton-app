import type { User, AuthProvider } from "../entities/User";

export interface CreateUserParams {
  email?: string;
  phone?: string;
  name?: string;
  passwordHash?: string;
  provider: AuthProvider;
  providerId: string;
}

export interface IUserRepo {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  findByAuthMethod(
    provider: AuthProvider,
    providerId: string,
  ): Promise<User | null>;
  createUserWithAuthMethod(params: CreateUserParams): Promise<User>;
  linkAuthMethod(
    userId: string,
    provider: AuthProvider,
    providerId: string,
  ): Promise<void>;
  setPasswordHash(userId: string, hash: string): Promise<void>;
  assignClub(userId: string, clubId: string): Promise<User>;
  findByIds(ids: string[]): Promise<User[]>;
  updateElo(userId: string, elo: number): Promise<void>;
  findAll(): Promise<User[]>;
}
