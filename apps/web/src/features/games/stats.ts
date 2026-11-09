import type { Game, GamePlayer, GameType } from "@bb/contracts";

/** Which side a player was on, or null when they didn't play. */
export const sideOf = (game: Game, userId: string): "team1" | "team2" | null =>
  game.team1Players.some((p) => p.id === userId) ? "team1" : game.team2Players.some((p) => p.id === userId) ? "team2" : null;

export type Outcome = "W" | "L" | "D";

export function outcomeFor(game: Game, userId: string): Outcome | null {
  const side = sideOf(game, userId);
  if (!side) return null;
  if (!game.winner) return "D";
  return game.winner === side ? "W" : "L";
}

/** "21–15, 18–21" from the player's point of view when given, team 1's otherwise. */
export function scoreLine(game: Game, userId?: string): string {
  const flip = userId !== undefined && sideOf(game, userId) === "team2";
  return game.sets.map((s) => (flip ? `${s.team2Score}–${s.team1Score}` : `${s.team1Score}–${s.team2Score}`)).join(", ");
}

export const teamName = (players: GamePlayer[], unknown: string) => players.map((p) => p.name || unknown).join(" & ");

export interface PlayerStats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  streak: { kind: "W" | "L"; count: number } | null;
  bestStreak: number;
  byType: Record<GameType, { total: number; wins: number }>;
  /** Most recent first. */
  form: { gameId: string; outcome: Outcome; playedAt: string }[];
  monthly: { key: string; date: Date; wins: number; losses: number }[];
}

/** Everything the dashboard and profile show, derived from the player's games (no extra requests). */
export function playerStats(games: Game[], userId: string, months = 12): PlayerStats {
  const mine = games
    .map((game) => ({ game, outcome: outcomeFor(game, userId) }))
    .filter((x): x is { game: Game; outcome: Outcome } => x.outcome !== null)
    .sort((a, b) => a.game.playedAt.localeCompare(b.game.playedAt));

  const wins = mine.filter((x) => x.outcome === "W").length;
  const decided = mine.filter((x) => x.outcome !== "D").length;

  let streak: PlayerStats["streak"] = null;
  for (let i = mine.length - 1; i >= 0; i--) {
    const o = mine[i]!.outcome;
    if (o === "D") break;
    if (!streak) streak = { kind: o, count: 1 };
    else if (streak.kind === o) streak.count++;
    else break;
  }

  let bestStreak = 0;
  let run = 0;
  for (const x of mine) {
    run = x.outcome === "W" ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
  }

  const byType: PlayerStats["byType"] = { SINGLES: { total: 0, wins: 0 }, DOUBLES: { total: 0, wins: 0 } };
  for (const x of mine) {
    byType[x.game.type].total++;
    if (x.outcome === "W") byType[x.game.type].wins++;
  }

  const now = new Date();
  const monthly = Array.from({ length: months }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    return { key: `${date.getFullYear()}-${date.getMonth()}`, date, wins: 0, losses: 0 };
  });
  const byKey = new Map(monthly.map((m) => [m.key, m]));
  for (const x of mine) {
    const d = new Date(x.game.playedAt);
    const bucket = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (bucket && x.outcome === "W") bucket.wins++;
    else if (bucket && x.outcome === "L") bucket.losses++;
  }

  return {
    total: mine.length,
    wins,
    losses: mine.filter((x) => x.outcome === "L").length,
    winRate: decided > 0 ? Math.round((wins / decided) * 100) : 0,
    streak,
    bestStreak,
    byType,
    form: mine
      .slice(-10)
      .reverse()
      .map((x) => ({ gameId: x.game.id, outcome: x.outcome, playedAt: x.game.playedAt })),
    monthly,
  };
}
