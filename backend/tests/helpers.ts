import { treaty } from "@elysiajs/eden";
import { createApp } from "../src/app";
import type { AppDependencies } from "../src/app";
import { JwtService } from "../src/application/jwt/JwtService";
import { normalizePhone } from "../src/application/utils/normalizePhone";

import type { IUserRepo } from "../src/domain/repositories/IUserRepo";
import type { IGameRepo } from "../src/domain/repositories/IGameRepo";
import type { IClubRepo } from "../src/domain/repositories/IClubRepo";
import type { IProfileRepo } from "../src/domain/repositories/IProfileRepo";
import type { IMagicTokenRepo } from "../src/domain/repositories/IMagicTokenRepo";
import type { IAuthProvider } from "../src/application/interfaces/IAuthProvider";
import type { User, Role } from "../src/domain/entities/User";
import type { Club } from "../src/domain/entities/Club";
import type { Profile } from "../src/domain/entities/Profile";
import type { Game } from "../src/domain/entities/Game";

export const JWT_SECRET = "test-secret-that-is-at-least-32-characters!!";

export function makeToken(sub: string, roles: Role[]) {
  const jwt = new JwtService(JWT_SECRET);
  return jwt.sign({ sub, roles });
}

// ── Mock repos ──────────────────────────────────────────────────────────────

export function mockUserRepo(): IUserRepo {
  const users = new Map<string, User>();
  // Pre-seed user-1 so COACH and CLUB_ADMIN permission checks work
  users.set("user-1", {
    id: "user-1",
    email: "user1@test.com",
    phone: null,
    passwordHash: null,
    roles: ["PLAYER"],
    elo: 200,
    isActive: true,
    lastAccess: null,
    clubId: "club-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return {
    findById: async (id) => users.get(id) ?? null,
    findByIds: async (ids) => ids.map((id) => users.get(id)).filter(Boolean) as User[],
    findByEmail: async () => null,
    findByPhone: async () => null,
    findByAuthMethod: async () => null,
    createUserWithAuthMethod: async (params) => {
      const user: User = {
        id: "new-user-" + Date.now(),
        email: params.email ?? null,
        phone: params.phone ?? null,
        passwordHash: params.passwordHash ?? null,
        roles: ["PLAYER"],
        elo: 200,
        isActive: true,
        lastAccess: null,
        clubId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      users.set(user.id, user);
      return user;
    },
    linkAuthMethod: async () => {},
    setPasswordHash: async () => {},
    updateEloSingles: async (userId, elo) => {
      const user = users.get(userId);
      if (user) user.eloSingles = elo;
    },
    updateEloDoubles: async (userId, elo) => {
      const user = users.get(userId);
      if (user) user.eloDoubles = elo;
    },
    assignClub: async (userId, clubId) => {
      const user = users.get(userId);
      if (!user) throw new Error("User not found");
      user.clubId = clubId;
      return user;
    },
    findAll: async () => Array.from(users.values()),
  };
}

export function mockGameRepo(): IGameRepo {
  const games: Game[] = [];
  return {
    create: async (data) => {
      const game: Game = {
        id: "game-" + Date.now(),
        type: data.type,
        clubId: data.clubId,
        team1PlayerIds: data.team1PlayerIds,
        team2PlayerIds: data.team2PlayerIds,
        sets: data.sets,
        registeredById: data.registeredById,
        playedAt: data.playedAt ?? new Date(),
        createdAt: new Date(),
      };
      games.push(game);
      return game;
    },
    findRecentByClub: async () => games.slice(0, 10),
    findByPlayerId: async () => games,
    findSharedBetween: async (playerIdA, playerIdB) =>
      games.filter(
        (g) =>
          (g.team1PlayerIds.includes(playerIdA) ||
            g.team2PlayerIds.includes(playerIdA)) &&
          (g.team1PlayerIds.includes(playerIdB) ||
            g.team2PlayerIds.includes(playerIdB)),
      ),
    findById: async (id) => games.find((g) => g.id === id) ?? null,
    update: async (id, data) => {
      const game = games.find((g) => g.id === id);
      if (!game) throw new Error("Game not found");
      Object.assign(game, data);
      return game;
    },
    delete: async (id) => {
      const idx = games.findIndex((g) => g.id === id);
      if (idx !== -1) games.splice(idx, 1);
    },
  };
}

export function mockClubRepo(): IClubRepo {
  const clubs = new Map<string, Club>();
  clubs.set("club-1", {
    id: "club-1",
    name: "Test Club",
    location: null,
    profilePicture: null,
    banner: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return {
    create: async (data) => {
      const club: Club = {
        id: "club-" + Date.now(),
        name: data.name,
        location: data.location ?? null,
        profilePicture: data.profilePicture ?? null,
        banner: data.banner ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      clubs.set(club.id, club);
      return club;
    },
    update: async (id, data) => {
      const club = clubs.get(id);
      if (!club) throw new Error("Club not found");
      Object.assign(club, data);
      return club;
    },
    findById: async (id) => clubs.get(id) ?? null,
    findAll: async () => [...clubs.values()],
  };
}

export function mockProfileRepo(): IProfileRepo {
  const profiles = new Map<string, Profile>();
  return {
    findByUserId: async (userId) => {
      let profile = profiles.get(userId);
      if (!profile) {
        profile = {
          id: "profile-" + userId,
          userId,
          name: "Test User",
          birthday: null,
          sex: null,
          photo: null,
          banner: null,
          bio: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        profiles.set(userId, profile);
      }
      return profile;
    },
    updateByUserId: async (userId, data) => {
      let profile = profiles.get(userId);
      if (!profile) {
        profile = {
          id: "profile-" + userId,
          userId,
          name: "Test User",
          birthday: null,
          sex: null,
          photo: null,
          banner: null,
          bio: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        profiles.set(userId, profile);
      }
      Object.assign(profile, data, { updatedAt: new Date() });
      return profile;
    },
  };
}

export function mockMagicTokenRepo(): IMagicTokenRepo {
  const tokens = new Map<string, any>();
  return {
    create: async (target, type, token, expiresAt) => {
      const t = { target, type, token, expiresAt, used: false };
      tokens.set(token, t);
      return { id: "token-" + Date.now(), ...t };
    },
    findByToken: async (token) => tokens.get(token) ?? null,
    markUsed: async () => {},
    deleteExpired: async () => {},
  };
}

export function mockAuthProvider(providerType: string): IAuthProvider {
  return {
    providerType,
    initiate: async () => ({
      type: (providerType === "google" ? "redirect" : "code-sent") as "redirect" | "code-sent",
      redirectUrl: providerType === "google" ? "https://accounts.google.com/o/oauth2/auth" : undefined,
      message: `${providerType} auth initiated`,
    }),
    complete: async () => ({
      providerId: "mock-provider-id",
      email: "test@example.com",
      name: "Test User",
    }),
  };
}

// ── Test setup ──────────────────────────────────────────────────────────────

export function setupDeps(): AppDependencies {
  return {
    userRepo: mockUserRepo(),
    gameRepo: mockGameRepo(),
    clubRepo: mockClubRepo(),
    profileRepo: mockProfileRepo(),
    magicTokenRepo: mockMagicTokenRepo(),
    jwtSecret: JWT_SECRET,
    authProviders: [
      mockAuthProvider("google"),
      mockAuthProvider("email"),
      mockAuthProvider("email-code"),
      mockAuthProvider("phone"),
      mockAuthProvider("password"),
    ],
  };
}

export function createAuthedApi(roles: Role[] = ["PLAYER"]) {
  const app = createApp(setupDeps());
  const token = makeToken("user-1", roles);
  return treaty(app, {
    headers: { cookie: `auth_token=${token}` },
  });
}

export function createUnauthedApi() {
  const app = createApp(setupDeps());
  return treaty(app);
}

import { PasswordAuthProvider } from "../src/application/providers/PasswordAuthProvider";

export async function setupDepsForPasswordTest() {
  const users = new Map<string, User>();
  const passwordHash = await PasswordAuthProvider.hashPassword("correct-password");

  const pwUser: User = {
    id: "pwuser-id",
    email: "pwuser@test.com",
    phone: null,
    passwordHash,
    roles: ["PLAYER"],
    elo: 200,
    isActive: true,
    lastAccess: null,
    clubId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  users.set("pwuser-id", pwUser);

  // Phone-based password user — stored with spaces to exercise normalization.
  const pwPhoneUser: User = {
    id: "pwphone-id",
    email: null,
    phone: "+351 912 345 678",
    passwordHash,
    roles: ["PLAYER"],
    elo: 200,
    isActive: true,
    lastAccess: null,
    clubId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  users.set("pwphone-id", pwPhoneUser);

  // Also pre-seed user-1 (needed for other tests)
  users.set("user-1", {
    id: "user-1",
    email: "user1@test.com",
    phone: null,
    passwordHash: null,
    roles: ["PLAYER"],
    elo: 200,
    isActive: true,
    lastAccess: null,
    clubId: "club-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Pre-seed additional players for game e2e tests
  for (const pid of ["player-1", "player-2", "player-3", "player-4"]) {
    users.set(pid, {
      id: pid,
      email: `${pid}@test.com`,
      phone: null,
      passwordHash: null,
      roles: ["PLAYER"],
      elo: 200,
      isActive: true,
      lastAccess: null,
      clubId: "club-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const userRepo: IUserRepo = {
    findById: async (id) => users.get(id) ?? null,
    findByIds: async (ids) => ids.map((id) => users.get(id)).filter(Boolean) as User[],
    findByEmail: async (email) => {
      for (const u of users.values()) {
        if (u.email === email) return u;
      }
      return null;
    },
    findByPhone: async (phone) => {
      const norm = normalizePhone(phone);
      for (const u of users.values()) {
        if (u.phone && normalizePhone(u.phone) === norm) return u;
      }
      return null;
    },
    findByAuthMethod: async () => null,
    createUserWithAuthMethod: async (params) => {
      const user: User = {
        id: "new-user-" + Date.now(),
        email: params.email ?? null,
        phone: params.phone ?? null,
        passwordHash: params.passwordHash ?? null,
        roles: ["PLAYER"],
        elo: 200,
        isActive: true,
        lastAccess: null,
        clubId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      users.set(user.id, user);
      return user;
    },
    linkAuthMethod: async () => {},
    setPasswordHash: async () => {},
    updateEloSingles: async (userId, elo) => {
      const user = users.get(userId);
      if (user) user.eloSingles = elo;
    },
    updateEloDoubles: async (userId, elo) => {
      const user = users.get(userId);
      if (user) user.eloDoubles = elo;
    },
    assignClub: async (userId, clubId) => {
      const user = users.get(userId);
      if (!user) throw new Error("User not found");
      user.clubId = clubId;
      return user;
    },
    findAll: async () => Array.from(users.values()),
  };

  return {
    userRepo,
    gameRepo: mockGameRepo(),
    clubRepo: mockClubRepo(),
    profileRepo: mockProfileRepo(),
    magicTokenRepo: mockMagicTokenRepo(),
    jwtSecret: JWT_SECRET,
    authProviders: [
      mockAuthProvider("google"),
      mockAuthProvider("email"),
      mockAuthProvider("email-code"),
      mockAuthProvider("phone"),
      new PasswordAuthProvider(userRepo),
    ],
  };
}
