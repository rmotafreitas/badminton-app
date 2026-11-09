import type {
  ClubImageKind,
  ClubRepository,
  GameChanges,
  GameRepository,
  ImageProcessor,
  NewGame,
  NewRallySession,
  ObjectStorage,
  PlayerDirectory,
  ProfileChanges,
  ProfileImageKind,
  ProfileRepository,
  RallySessionPatch,
  RallySessionRepository,
  RateLimiter,
  Secrets,
  SessionRepository,
  SignInChallenge,
  SignInChallengeRepository,
  SignInMessenger,
  StoredSession,
  TrainingReviewRepository,
  UserRepository,
} from "@bb/application";
import { normalizePhone } from "@bb/application";
import type { Infrastructure } from "@bb/bootstrap";
import { fakeRecords } from "./fake-records";
import { fakeMemberDetails, fakeRegistrationForms, fakeRegistrations, fakeRegistrationTables } from "./fake-registrations";
import {
  type AuthProvider,
  type Club,
  DEFAULT_RATING,
  type Game,
  type PlayerProfile,
  type RallySession,
  type Role,
  type TrainingReview,
  type User,
} from "@bb/domain";

let counter = 0;
/** Deterministic 24-hex ids, like MongoDB ObjectIds. */
export const nextId = (): string => (++counter).toString(16).padStart(24, "0");

export class FakeClock {
  constructor(public current = new Date("2026-11-06T12:00:00Z")) {}
  now = () => new Date(this.current);
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

interface ProfileRow {
  name: string;
  birthday: Date | null;
  sex: string | null;
  bio: string | null;
  photo: string | null;
  photoVersion: string | null;
  banner: string | null;
  bannerVersion: string | null;
  updatedAt: Date;
}

/** One in-memory "database" all fake repositories share, so joins (club roster, game players) behave like Mongo. */
export class FakeStore {
  users = new Map<string, Omit<User, "name" | "photoVersion">>();
  profiles = new Map<string, ProfileRow>();
  authMethods = new Map<string, string>();
  sessions = new Map<string, StoredSession & { tokenHash: string }>();
  challenges = new Map<string, SignInChallenge & { secretHash: string }>();
  clubs = new Map<string, Club & { picture: string | null; banner: string | null }>();
  games = new Map<string, Game>();
  reviews = new Map<string, TrainingReview>();
  rally = new Map<string, RallySession>();
  sent: { channel: "link" | "email-code" | "sms"; to: string; secret: string }[] = [];
  storageObjects = new Set<string>();
  deletedObjects: string[] = [];
  /** Registration details, club form settings and registrations. */
  registration = fakeRegistrationTables();
  /** Readiness probe answer (tests flip it to simulate a database outage). */
  healthy = true;

  constructor(readonly clock: FakeClock) {}

  withProfile(u: Omit<User, "name" | "photoVersion">): User {
    const p = this.profiles.get(u.id);
    return { ...u, name: p?.name || null, photoVersion: p?.photoVersion ?? null };
  }

  /** Test helper: a user with a profile, in a club or not. */
  addUser(input: { name?: string; email?: string; phone?: string; roles?: Role[]; clubId?: string | null; passwordHash?: string; isActive?: boolean }): User {
    const id = nextId();
    const now = this.clock.now();
    this.users.set(id, {
      id,
      email: input.email ?? null,
      phone: input.phone ?? null,
      passwordHash: input.passwordHash ?? null,
      roles: input.roles ?? ["PLAYER"],
      eloSingles: DEFAULT_RATING,
      eloDoubles: DEFAULT_RATING,
      isActive: input.isActive ?? true,
      clubId: input.clubId ?? null,
      createdAt: now,
      lastAccess: null,
    });
    this.profiles.set(id, {
      name: input.name ?? "",
      birthday: null,
      sex: null,
      bio: null,
      photo: null,
      photoVersion: null,
      banner: null,
      bannerVersion: null,
      updatedAt: now,
    });
    return this.withProfile(this.users.get(id)!);
  }

  addClub(name = "Club"): Club {
    const id = nextId();
    const now = this.clock.now();
    const club = { id, name, location: null, pictureVersion: null, bannerVersion: null, createdAt: now, updatedAt: now, picture: null, banner: null };
    this.clubs.set(id, club);
    return club;
  }
}

export function fakeUsers(store: FakeStore): UserRepository {
  const all = () => [...store.users.values()].map((u) => store.withProfile(u));
  return {
    findById: async (id) => (store.users.has(id) ? store.withProfile(store.users.get(id)!) : null),
    findByIds: async (ids) => all().filter((u) => ids.includes(u.id)),
    findByEmail: async (email) => all().find((u) => u.email === email) ?? null,
    findByPhone: async (phone) => all().find((u) => normalizePhone(u.phone) === phone) ?? null,
    findByAuthMethod: async (provider: AuthProvider, providerId) => {
      const userId = store.authMethods.get(`${provider}:${providerId}`);
      return userId ? store.withProfile(store.users.get(userId)!) : null;
    },
    async create(input) {
      const user = store.addUser({ email: input.email, phone: input.phone, name: input.name });
      store.authMethods.set(`${input.provider}:${input.providerId}`, user.id);
      return user;
    },
    async createInvited(input) {
      return store.addUser({ email: input.email, phone: input.phone, name: input.name, roles: [...input.roles], clubId: input.clubId });
    },
    updateAccount: async (userId, changes) => {
      const row = store.users.get(userId);
      if (row) store.users.set(userId, { ...row, ...changes });
    },
    delete: async (userId) => {
      store.users.delete(userId);
      store.profiles.delete(userId);
      for (const [key, id] of store.authMethods) if (id === userId) store.authMethods.delete(key);
      for (const s of [...store.sessions.values()]) if (s.userId === userId) store.sessions.delete(s.id);
      for (const r of [...store.reviews.values()]) if (r.userId === userId) store.reviews.delete(r.id);
      store.registration.details.delete(userId);
      for (const r of [...store.registration.registrations.values()]) if (r.userId === userId) store.registration.registrations.delete(r.id);
    },
    touch: async (userId, at) => {
      const row = store.users.get(userId);
      if (row) store.users.set(userId, { ...row, lastAccess: at });
    },
    linkAuthMethod: async (userId, provider, providerId) => {
      store.authMethods.set(`${provider}:${providerId}`, userId);
    },
    setClub: async (userId, clubId) => {
      store.users.set(userId, { ...store.users.get(userId)!, clubId });
    },
    clearClub: async (clubId) => {
      for (const u of store.users.values()) if (u.clubId === clubId) store.users.set(u.id, { ...u, clubId: null });
    },
    listAll: async () => all(),
    setRoles: async (userId, roles) => {
      store.users.set(userId, { ...store.users.get(userId)!, roles: [...roles] });
    },
    setRatings: async (updates) => {
      for (const u of updates) {
        const row = store.users.get(u.userId);
        if (row) store.users.set(u.userId, { ...row, eloSingles: u.eloSingles ?? row.eloSingles, eloDoubles: u.eloDoubles ?? row.eloDoubles });
      }
    },
  };
}

export function fakeSessions(store: FakeStore): SessionRepository {
  return {
    async create(input) {
      const session = { id: nextId(), userId: input.userId, expiresAt: input.expiresAt, tokenHash: input.tokenHash };
      store.sessions.set(session.id, session);
      return session;
    },
    findByTokenHash: async (hash) => [...store.sessions.values()].find((s) => s.tokenHash === hash) ?? null,
    extend: async (id, expiresAt) => {
      const s = store.sessions.get(id);
      if (s) store.sessions.set(id, { ...s, expiresAt });
    },
    delete: async (id) => {
      store.sessions.delete(id);
    },
    deleteExpired: async (now) => {
      let n = 0;
      for (const s of [...store.sessions.values()]) if (s.expiresAt < now && store.sessions.delete(s.id)) n++;
      return n;
    },
  };
}

export function fakeChallenges(store: FakeStore): SignInChallengeRepository {
  return {
    create: async (input) => {
      const id = nextId();
      store.challenges.set(id, { id, kind: input.kind, target: input.target, expiresAt: input.expiresAt, used: false, secretHash: input.secretHash });
    },
    findBySecretHash: async (hash) => [...store.challenges.values()].find((c) => c.secretHash === hash) ?? null,
    consume: async (id) => {
      const c = store.challenges.get(id);
      if (!c || c.used) return false;
      store.challenges.set(id, { ...c, used: true });
      return true;
    },
    deleteExpired: async (now) => {
      let n = 0;
      for (const c of [...store.challenges.values()]) if (c.expiresAt < now && store.challenges.delete(c.id)) n++;
      return n;
    },
  };
}

/** Readable, predictable secrets: tokens and codes are counters, the hash is a prefix. */
export function fakeSecrets(): Secrets {
  let n = 0;
  return {
    token: () => `token-${String(++n).padStart(24, "0")}`,
    numericCode: (digits) => String(123456 + n++).slice(-digits).padStart(digits, "0"),
    hash: (secret) => `hash:${secret}`,
  };
}

export function fakeMessenger(store: FakeStore): SignInMessenger {
  return {
    sendMagicLink: async (to, link) => {
      store.sent.push({ channel: "link", to, secret: new URL(link).searchParams.get("token") ?? "" });
    },
    sendEmailCode: async (to, code) => {
      store.sent.push({ channel: "email-code", to, secret: code });
    },
    sendSmsCode: async (to, code) => {
      store.sent.push({ channel: "sms", to, secret: code });
    },
  };
}

export function fakeLimiter(): RateLimiter & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  return {
    counts,
    refund: async (key) => {
      counts.set(key, Math.max(0, (counts.get(key) ?? 0) - 1));
    },
    purgeExpired: async () => {
      const n = counts.size;
      counts.clear();
      return n;
    },
    async hit(key, _window, max) {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return count <= max ? { allowed: true, retryAfterSeconds: 0 } : { allowed: false, retryAfterSeconds: 60 };
    },
  };
}

export function fakeClubs(store: FakeStore): ClubRepository {
  const strip = ({ picture: _p, banner: _b, ...club }: Club & { picture: string | null; banner: string | null }): Club => club;
  return {
    create: async (input) => {
      const club = store.addClub(input.name);
      store.clubs.set(club.id, { ...store.clubs.get(club.id)!, location: input.location });
      return strip(store.clubs.get(club.id)!);
    },
    update: async (id, input) => {
      const c = store.clubs.get(id)!;
      store.clubs.set(id, { ...c, ...input, updatedAt: store.clock.now() });
      return strip(store.clubs.get(id)!);
    },
    findById: async (id) => (store.clubs.has(id) ? strip(store.clubs.get(id)!) : null),
    findWithMembers: async (id) => {
      const c = store.clubs.get(id);
      if (!c) return null;
      const members = [...store.users.values()]
        .filter((u) => u.clubId === id)
        .map((u) => {
          const full = store.withProfile(u);
          return { id: u.id, email: u.email, roles: u.roles, name: full.name, photoVersion: full.photoVersion, eloSingles: u.eloSingles, eloDoubles: u.eloDoubles, joinedAt: u.createdAt };
        });
      return { ...strip(c), members };
    },
    listAll: async () => [...store.clubs.values()].map(strip),
    delete: async (id) => {
      store.clubs.delete(id);
    },
    setImage: async (id, kind: ClubImageKind, image) => {
      const c = store.clubs.get(id)!;
      store.clubs.set(id, kind === "picture"
        ? { ...c, picture: image?.dataUrl ?? null, pictureVersion: image?.version ?? null }
        : { ...c, banner: image?.dataUrl ?? null, bannerVersion: image?.version ?? null });
    },
    getImage: async (id, kind) => (kind === "picture" ? store.clubs.get(id)?.picture : store.clubs.get(id)?.banner) ?? null,
    countGames: async (id) => [...store.games.values()].filter((g) => g.clubId === id).length,
  };
}

export function fakeGames(store: FakeStore): GameRepository {
  const involves = (g: Game, id: string) => g.team1PlayerIds.includes(id) || g.team2PlayerIds.includes(id);
  const newest = (a: Game, b: Game) => b.playedAt.getTime() - a.playedAt.getTime();
  return {
    create: async (input: NewGame) => {
      const game: Game = { ...input, id: nextId(), createdAt: store.clock.now() };
      store.games.set(game.id, game);
      return game;
    },
    findById: async (id) => store.games.get(id) ?? null,
    update: async (id, changes: GameChanges) => {
      const game = { ...store.games.get(id)!, ...changes } as Game;
      store.games.set(id, game);
      return game;
    },
    delete: async (id) => {
      store.games.delete(id);
    },
    listByClub: async (clubId, limit) => [...store.games.values()].filter((g) => g.clubId === clubId).sort(newest).slice(0, limit),
    listAllByClub: async (clubId) => [...store.games.values()].filter((g) => g.clubId === clubId),
    listByPlayer: async (id) => [...store.games.values()].filter((g) => involves(g, id)).sort(newest),
    countForUser: async (id) => [...store.games.values()].filter((g) => involves(g, id) || g.registeredById === id).length,
    listShared: async (a, b) => [...store.games.values()].filter((g) => involves(g, a) && involves(g, b)).sort(newest),
  };
}

export function fakePlayers(store: FakeStore): PlayerDirectory & { calls: number } {
  const directory = {
    calls: 0,
    async findPlayers(ids: readonly string[]) {
      directory.calls++;
      return ids
        .filter((id) => store.users.has(id))
        .map((id) => {
          const u = store.withProfile(store.users.get(id)!);
          return { id, name: u.name, email: u.email, photoVersion: u.photoVersion };
        });
    },
  };
  return directory;
}

export function fakeProfiles(store: FakeStore): ProfileRepository {
  return {
    findPlayer: async (userId): Promise<PlayerProfile | null> => {
      const u = store.users.get(userId);
      const p = store.profiles.get(userId);
      if (!u || !p) return null;
      return {
        userId,
        name: p.name,
        birthday: p.birthday,
        sex: p.sex,
        bio: p.bio,
        photoVersion: p.photoVersion,
        bannerVersion: p.bannerVersion,
        updatedAt: p.updatedAt,
        email: u.email,
        phone: u.phone,
        roles: u.roles,
        clubId: u.clubId,
        eloSingles: u.eloSingles,
        eloDoubles: u.eloDoubles,
        memberSince: u.createdAt,
      };
    },
    update: async (userId, changes: ProfileChanges) => {
      store.profiles.set(userId, { ...store.profiles.get(userId)!, ...changes, updatedAt: store.clock.now() });
    },
    setImage: async (userId, kind: ProfileImageKind, image) => {
      const p = store.profiles.get(userId)!;
      store.profiles.set(userId, kind === "photo"
        ? { ...p, photo: image?.dataUrl ?? null, photoVersion: image?.version ?? null }
        : { ...p, banner: image?.dataUrl ?? null, bannerVersion: image?.version ?? null });
    },
    getImage: async (userId, kind) => (kind === "photo" ? store.profiles.get(userId)?.photo : store.profiles.get(userId)?.banner) ?? null,
  };
}

export function fakeReviews(store: FakeStore): TrainingReviewRepository {
  return {
    upsert: async (input) => {
      const existing = [...store.reviews.values()].find((r) => r.userId === input.userId && r.date === input.date);
      const now = store.clock.now();
      const review: TrainingReview = existing
        ? { ...existing, effort: input.effort, note: input.note, updatedAt: now }
        : { id: nextId(), ...input, createdAt: now, updatedAt: now };
      store.reviews.set(review.id, review);
      return review;
    },
    findById: async (id) => store.reviews.get(id) ?? null,
    findByUserAndDate: async (userId, date) => [...store.reviews.values()].find((r) => r.userId === userId && r.date === date) ?? null,
    listByUser: async (userId, { from, to }) =>
      [...store.reviews.values()]
        .filter((r) => r.userId === userId && (!from || r.date >= from) && (!to || r.date <= to))
        .sort((a, b) => b.date.localeCompare(a.date)),
    delete: async (id) => {
      store.reviews.delete(id);
    },
  };
}

export function fakeRally(store: FakeStore): RallySessionRepository {
  const list = () => [...store.rally.values()].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
  return {
    create: async (input: NewRallySession) => {
      const now = store.clock.now();
      const session: RallySession = {
        ...input,
        id: nextId(),
        status: "pending",
        format: null,
        participants: [],
        videoKey: null,
        videoBytes: null,
        videoUploadedAt: null,
        videoExpiresAt: null,
        pinned: false,
        resultKey: null,
        summary: null,
        corrections: null,
        analysisLock: null,
        shareForTraining: false,
        createdAt: now,
        updatedAt: now,
      };
      store.rally.set(session.id, session);
      return session;
    },
    findById: async (id) => store.rally.get(id) ?? null,
    findByClientId: async (ownerId, clientId) => list().find((s) => s.ownerId === ownerId && s.clientId === clientId) ?? null,
    findForUser: async (userId) => list().filter((s) => s.ownerId === userId || s.participants.some((p) => p.userId === userId)),
    findWithParticipant: async (userId) => list().filter((s) => s.participants.some((p) => p.userId === userId)),
    findByGameId: async (gameId) => list().filter((s) => s.gameId === gameId),
    findExpiredVideos: async (now) => list().filter((s) => !s.pinned && s.videoKey && s.videoExpiresAt && s.videoExpiresAt < now),
    update: async (id, patch: RallySessionPatch) => {
      const session = { ...store.rally.get(id)!, ...patch, updatedAt: store.clock.now() } as RallySession;
      store.rally.set(id, session);
      return session;
    },
    acquireLock: async (id, deviceId, until, now) => {
      const s = store.rally.get(id);
      if (!s) return null;
      const lock = s.analysisLock;
      if (lock && lock.until >= now && lock.deviceId !== deviceId) return null;
      const next = { ...s, analysisLock: { deviceId, until } };
      store.rally.set(id, next);
      return next;
    },
    delete: async (id) => {
      store.rally.delete(id);
    },
  };
}

export function fakeStorage(store: FakeStore, configured = true): ObjectStorage {
  return {
    configured,
    presignPut: async (key) => `https://storage.test/${key}?put`,
    presignGet: async (key) => `https://storage.test/${key}?get`,
    delete: async (key) => {
      store.deletedObjects.push(key);
    },
  };
}

/** Pretends to re-encode: keeps the bytes, versions them by length + first byte. */
export const fakeImages: ImageProcessor = {
  async toWebp(bytes) {
    return { dataUrl: `data:image/webp;base64,${Buffer.from(bytes).toString("base64")}`, version: `v${bytes.length}x${bytes[0] ?? 0}`.padEnd(8, "0") };
  },
};

export const silentLogger = { info() {}, warn() {}, error() {} };

/** A complete in-memory `Infrastructure`: real use cases, no database, no network. */
export function fakeInfrastructure(options: { storageConfigured?: boolean } = {}) {
  const clock = new FakeClock();
  const store = new FakeStore(clock);
  const limiter = fakeLimiter();
  const players = fakePlayers(store);
  const infra: Infrastructure = {
    clock,
    logger: silentLogger,
    health: { database: async () => store.healthy },
    limiter,
    secrets: fakeSecrets(),
    passwords: { verify: async (password, hash) => hash === `pw:${password}` },
    google: {
      configured: true,
      verifyIdToken: async (credential) => ({ sub: `google-${credential}`, email: `${credential}@gmail.test`, name: "Google User" }),
      verifyAccessToken: async (token) => ({ sub: `google-${token}`, email: `${token}@gmail.test` }),
    },
    messenger: fakeMessenger(store),
    images: fakeImages,
    storage: fakeStorage(store, options.storageConfigured ?? true),
    users: fakeUsers(store),
    sessions: fakeSessions(store),
    challenges: fakeChallenges(store),
    clubs: fakeClubs(store),
    games: fakeGames(store),
    players,
    profiles: fakeProfiles(store),
    reviews: fakeReviews(store),
    rally: fakeRally(store),
    records: fakeRecords(store),
    memberDetails: fakeMemberDetails(store, store.registration),
    registrationForms: fakeRegistrationForms(store.registration),
    registrations: fakeRegistrations(store, store.registration),
  };
  return { infra, store, clock, limiter, players };
}
