export const GAME_TYPES = ["SINGLES", "DOUBLES"] as const;
export type GameType = (typeof GAME_TYPES)[number];

export interface GameSet {
  readonly team1Score: number;
  readonly team2Score: number;
}

export interface GamePlayer {
  readonly id: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly photoVersion: string | null;
}

export interface Game {
  readonly id: string;
  readonly type: GameType;
  readonly clubId: string;
  readonly team1PlayerIds: readonly string[];
  readonly team2PlayerIds: readonly string[];
  readonly sets: readonly GameSet[];
  readonly registeredById: string;
  readonly playedAt: Date;
  readonly createdAt: Date;
}

/** A game with its players' display data, for lists and detail pages. */
export interface GameWithPlayers extends Game {
  readonly team1Players: readonly GamePlayer[];
  readonly team2Players: readonly GamePlayer[];
}

export interface GameOutcome {
  readonly winner: "team1" | "team2" | null;
  readonly team1SetsWon: number;
  readonly team2SetsWon: number;
  /** One set entered as points only ("quick" registration). */
  readonly isQuickMode: boolean;
}

export function gameOutcome(sets: readonly GameSet[]): GameOutcome {
  let team1SetsWon = 0;
  let team2SetsWon = 0;
  for (const set of sets) {
    if (set.team1Score > set.team2Score) team1SetsWon++;
    else if (set.team2Score > set.team1Score) team2SetsWon++;
  }
  const winner = team1SetsWon > team2SetsWon ? "team1" : team2SetsWon > team1SetsWon ? "team2" : null;
  return { winner, team1SetsWon, team2SetsWon, isQuickMode: sets.length <= 1 };
}

export const playsIn = (game: Pick<Game, "team1PlayerIds" | "team2PlayerIds">, userId: string): boolean =>
  game.team1PlayerIds.includes(userId) || game.team2PlayerIds.includes(userId);

export interface GameLineup {
  readonly type: GameType;
  readonly team1PlayerIds: readonly string[];
  readonly team2PlayerIds: readonly string[];
  readonly sets: readonly GameSet[];
}

/** The shape every stored game must have: right team sizes, distinct players, sane scores. */
export function lineupProblem(lineup: GameLineup): string | null {
  const size = lineup.type === "SINGLES" ? 1 : 2;
  if (lineup.team1PlayerIds.length !== size || lineup.team2PlayerIds.length !== size) {
    return lineup.type === "SINGLES" ? "A singles game has one player per team." : "A doubles game has two players per team.";
  }
  const all = [...lineup.team1PlayerIds, ...lineup.team2PlayerIds];
  if (new Set(all).size !== all.length) return "A player can't appear twice in one game.";
  if (lineup.sets.length === 0 || lineup.sets.length > 5) return "A game has between one and five sets.";
  for (const set of lineup.sets) {
    const scores = [set.team1Score, set.team2Score];
    if (scores.some((s) => !Number.isInteger(s) || s < 0 || s > 99)) return "Scores are whole numbers from 0 to 99.";
  }
  return null;
}
