/**
 * Badminton scoring (BWF rally point): a game goes to 21, must be won by 2, and is capped at 30 (29–29 → next point
 * wins). A match is best of three games. Whoever wins a rally serves next, from the right service court when their
 * score is even and from the left when it is odd. In the deciding game players change ends when the leader reaches 11.
 */
export type Side = 1 | 2;
export interface SetScore {
  readonly a: number;
  readonly b: number;
}

export const POINTS_TO_WIN = 21;
export const POINTS_CAP = 30;

/** Who won this game, or null while it is still being played. */
export function gameWinner({ a, b }: SetScore): Side | null {
  const top = Math.max(a, b);
  if (top >= POINTS_CAP || (top >= POINTS_TO_WIN && Math.abs(a - b) >= 2)) return a > b ? 1 : 2;
  return null;
}

export interface LiveMatch {
  /** Every rally in order: who won it. The whole state derives from this, so undo is just "drop the last one". */
  readonly rallies: readonly Side[];
  /** Who served the very first rally. */
  readonly firstServer: Side;
  /** Games won to take the match: 2 for best of three. */
  readonly gamesToWin: number;
}

export interface LiveState {
  readonly games: SetScore[];
  readonly current: SetScore;
  readonly gamesWon: { a: number; b: number };
  /** The current game just ended and no rally of the next one was played yet. */
  readonly gameOver: boolean;
  readonly matchWinner: Side | null;
  readonly server: Side;
  /** Court the server serves from. */
  readonly serviceCourt: "right" | "left";
  /** Deciding game: change ends at 11 — true right when the leader reaches it. */
  readonly changeEnds: boolean;
  readonly gameNumber: number;
}

export const newMatch = (firstServer: Side = 1, gamesToWin = 2): LiveMatch => ({ rallies: [], firstServer, gamesToWin });

export function replay(match: LiveMatch): LiveState {
  const games: SetScore[] = [];
  let current = { a: 0, b: 0 };
  let won = { a: 0, b: 0 };
  let server: Side = match.firstServer;
  let changeEnds = false;
  let gameOver = false;
  for (const winner of match.rallies) {
    if (gameOver) {
      // A rally after a finished game starts the next one.
      current = { a: 0, b: 0 };
      gameOver = false;
    }
    current = winner === 1 ? { ...current, a: current.a + 1 } : { ...current, b: current.b + 1 };
    server = winner;
    const deciding = won.a + won.b === match.gamesToWin * 2 - 2;
    changeEnds = deciding && Math.max(current.a, current.b) === 11 && Math.min(current.a, current.b) < 11;
    const w = gameWinner(current);
    if (w) {
      games.push(current);
      won = w === 1 ? { ...won, a: won.a + 1 } : { ...won, b: won.b + 1 };
      gameOver = true;
    }
  }
  const matchWinner = won.a >= match.gamesToWin ? 1 : won.b >= match.gamesToWin ? 2 : null;
  const serverScore = server === 1 ? current.a : current.b;
  return {
    games,
    current: gameOver ? (games.at(-1) ?? current) : current,
    gamesWon: won,
    gameOver,
    matchWinner,
    server,
    serviceCourt: serverScore % 2 === 0 ? "right" : "left",
    changeEnds,
    gameNumber: games.length + (gameOver ? 0 : 1),
  };
}

export const point = (match: LiveMatch, side: Side): LiveMatch =>
  replay(match).matchWinner ? match : { ...match, rallies: [...match.rallies, side] };

export const undo = (match: LiveMatch): LiveMatch => ({ ...match, rallies: match.rallies.slice(0, -1) });

/** Scores a finished-game picker offers for the losing side once the winner's is known (21 → 0–19, 22 → 20, …). */
export function loserOptions(winner: number): number[] {
  if (winner < POINTS_TO_WIN) return Array.from({ length: Math.max(0, winner - 1) }, (_, i) => i);
  if (winner === POINTS_TO_WIN) return Array.from({ length: 20 }, (_, i) => i);
  if (winner === POINTS_CAP) return [28, 29];
  return [winner - 2];
}
