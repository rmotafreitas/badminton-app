import { DEFAULT_RATING } from "@/identity/user";
import { type Game, type GameType, gameOutcome } from "./game";

const K_FACTOR = 32;
const SCALE = 400;

const expectedScore = (rating: number, opponent: number): number => 1 / (1 + 10 ** ((opponent - rating) / SCALE));

export interface RatingChange {
  readonly playerId: string;
  readonly before: number;
  readonly after: number;
}

/**
 * Team Elo: each side plays at its average rating; every player moves by the same delta as their team. A drawn
 * game (equal sets) counts as a loss for team 1, as it always has.
 */
export function rateGame(
  team1: readonly { playerId: string; rating: number }[],
  team2: readonly { playerId: string; rating: number }[],
  team1Won: boolean,
): RatingChange[] {
  const average = (team: typeof team1) => team.reduce((sum, p) => sum + p.rating, 0) / team.length;
  const expected1 = expectedScore(average(team1), average(team2));
  const actual1 = team1Won ? 1 : 0;
  const move = (rating: number, expected: number, actual: number) => Math.round(rating + K_FACTOR * (actual - expected));
  return [
    ...team1.map((p) => ({ playerId: p.playerId, before: p.rating, after: move(p.rating, expected1, actual1) })),
    ...team2.map((p) => ({ playerId: p.playerId, before: p.rating, after: move(p.rating, 1 - expected1, 1 - actual1) })),
  ];
}

export interface Ratings {
  singles: number;
  doubles: number;
}

const field = (type: GameType): keyof Ratings => (type === "SINGLES" ? "singles" : "doubles");

/** Applies one game to a ratings table in place. Players missing from the table start at the default rating. */
export function applyGame(table: Map<string, Ratings>, game: Pick<Game, "type" | "team1PlayerIds" | "team2PlayerIds" | "sets">): RatingChange[] {
  const key = field(game.type);
  const ratingOf = (id: string) => table.get(id)?.[key] ?? DEFAULT_RATING;
  const changes = rateGame(
    game.team1PlayerIds.map((playerId) => ({ playerId, rating: ratingOf(playerId) })),
    game.team2PlayerIds.map((playerId) => ({ playerId, rating: ratingOf(playerId) })),
    gameOutcome(game.sets).winner === "team1",
  );
  for (const change of changes) {
    const current = table.get(change.playerId) ?? { singles: DEFAULT_RATING, doubles: DEFAULT_RATING };
    current[key] = change.after;
    table.set(change.playerId, current);
  }
  return changes;
}

/**
 * Replays games in the order they were played, from the default rating. Used after an edit or a delete, because
 * a change to an old game moves every rating computed after it.
 */
export function replayRatings(
  games: readonly Pick<Game, "type" | "team1PlayerIds" | "team2PlayerIds" | "sets" | "playedAt" | "createdAt">[],
): Map<string, Ratings> {
  const table = new Map<string, Ratings>();
  const ordered = [...games].sort(
    (a, b) => a.playedAt.getTime() - b.playedAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  for (const game of ordered) applyGame(table, game);
  return table;
}

export interface RatingPoint {
  readonly gameId: string;
  readonly playedAt: Date;
  readonly rating: number;
}

/**
 * One player's rating after each of their games, from a replay of every game that could move it (the clubs they
 * played in). The same replay the server stores, so the chart ends exactly at the stored rating.
 */
export function ratingTimeline(
  games: readonly Pick<Game, "id" | "type" | "team1PlayerIds" | "team2PlayerIds" | "sets" | "playedAt" | "createdAt">[],
  playerId: string,
): { singles: RatingPoint[]; doubles: RatingPoint[] } {
  const table = new Map<string, Ratings>();
  const out = { singles: [] as RatingPoint[], doubles: [] as RatingPoint[] };
  const ordered = [...games].sort(
    (a, b) => a.playedAt.getTime() - b.playedAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  for (const game of ordered) {
    const change = applyGame(table, game).find((c) => c.playerId === playerId);
    if (change) out[field(game.type)].push({ gameId: game.id, playedAt: game.playedAt, rating: change.after });
  }
  return out;
}
