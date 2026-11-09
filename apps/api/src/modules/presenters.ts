import type { Club, ClubDetail, Game, Profile, RallySession, SessionUser, TrainingReview, UserSummary } from "@bb/contracts";
import {
  type Club as ClubEntity,
  type ClubWithMembers,
  type GameWithPlayers,
  gameOutcome,
  type PlayerProfile,
  type RallySession as RallyEntity,
  type TrainingReview as ReviewEntity,
  type User,
} from "@bb/domain";
import { clubImageUrl, profileImageUrl } from "@/http";

/** Domain → contract shapes. Dates become ISO strings; stored images become cacheable URLs. */
const iso = (d: Date) => d.toISOString();

export const presentSessionUser = (u: User): SessionUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  roles: [...u.roles],
  clubId: u.clubId,
  eloSingles: u.eloSingles,
  eloDoubles: u.eloDoubles,
  photoUrl: profileImageUrl(u.id, "photo", u.photoVersion),
});

export const presentUserSummary = (u: User): UserSummary => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  roles: [...u.roles],
  clubId: u.clubId,
  photoUrl: profileImageUrl(u.id, "photo", u.photoVersion),
});

export const presentClub = (c: ClubEntity): Club => ({
  id: c.id,
  name: c.name,
  location: c.location,
  pictureUrl: clubImageUrl(c.id, "picture", c.pictureVersion),
  bannerUrl: clubImageUrl(c.id, "banner", c.bannerVersion),
  createdAt: iso(c.createdAt),
  updatedAt: iso(c.updatedAt),
});

export const presentClubDetail = (c: ClubWithMembers): ClubDetail => ({
  ...presentClub(c),
  members: c.members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    roles: [...m.roles],
    photoUrl: profileImageUrl(m.id, "photo", m.photoVersion),
    eloSingles: m.eloSingles,
    eloDoubles: m.eloDoubles,
    joinedAt: iso(m.joinedAt),
  })),
});

export const presentGame = (g: GameWithPlayers): Game => {
  const player = (p: GameWithPlayers["team1Players"][number]) => ({
    id: p.id,
    name: p.name,
    photoUrl: profileImageUrl(p.id, "photo", p.photoVersion),
  });
  return {
    id: g.id,
    type: g.type,
    clubId: g.clubId,
    team1Players: g.team1Players.map(player),
    team2Players: g.team2Players.map(player),
    sets: g.sets.map((s) => ({ ...s })),
    registeredById: g.registeredById,
    playedAt: iso(g.playedAt),
    createdAt: iso(g.createdAt),
    ...gameOutcome(g.sets),
  };
};

export const presentProfile = (p: PlayerProfile): Profile => ({
  userId: p.userId,
  name: p.name,
  email: p.email,
  phone: p.phone,
  roles: [...p.roles],
  clubId: p.clubId,
  birthday: p.birthday ? iso(p.birthday).slice(0, 10) : null,
  sex: p.sex,
  bio: p.bio,
  photoUrl: profileImageUrl(p.userId, "photo", p.photoVersion),
  bannerUrl: profileImageUrl(p.userId, "banner", p.bannerVersion),
  eloSingles: p.eloSingles,
  eloDoubles: p.eloDoubles,
  memberSince: iso(p.memberSince),
  updatedAt: iso(p.updatedAt),
});

export const presentReview = (r: ReviewEntity): TrainingReview => ({
  id: r.id,
  date: r.date,
  effort: r.effort,
  note: r.note,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
});

/**
 * Summary access (club-mates) hides corrections, video and lock state: they see the stats, not the footage.
 * A device that died mid-analysis leaves "analysing" behind; once its lease ran out nobody is analysing it.
 */
export function presentRallySession(s: RallyEntity, access: "full" | "summary", now: Date): RallySession {
  const stale = s.status === "analysing" && (!s.analysisLock || s.analysisLock.until < now);
  const base: RallySession = {
    id: s.id,
    ownerId: s.ownerId,
    title: s.title,
    recordedAt: iso(s.recordedAt),
    durationS: s.durationS,
    status: stale ? "pending" : s.status,
    format: s.format,
    gameId: s.gameId,
    trainingDate: s.trainingDate,
    participants: s.participants.map((p) => ({ ...p })),
    summary: s.summary ?? null,
    access,
    createdAt: iso(s.createdAt),
    updatedAt: iso(s.updatedAt),
  };
  if (access === "summary") return base;
  return {
    ...base,
    clientId: s.clientId,
    hasVideo: !!s.videoKey,
    videoBytes: s.videoBytes,
    videoExpiresAt: s.videoExpiresAt ? iso(s.videoExpiresAt) : null,
    pinned: s.pinned,
    hasResult: !!s.resultKey,
    corrections: s.corrections ?? null,
    analysisLock: s.analysisLock ? { deviceId: s.analysisLock.deviceId, until: iso(s.analysisLock.until) } : null,
    shareForTraining: s.shareForTraining,
  };
}
