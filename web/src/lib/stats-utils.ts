import type { Game, GameType } from "@/core/domain/game";

/* ── ELO (ported from backend EloCalculator) ─────────────────────────── */

const K_FACTOR = 32;
const SCALE = 400;
const DEFAULT_ELO = 200;

function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / SCALE));
}

function newRating(rating: number, expected: number, actual: number): number {
  return Math.round(rating + K_FACTOR * (actual - expected));
}

/* ── Types ───────────────────────────────────────────────────────────── */

export interface EloPoint {
  date: string;
  elo: number;
  label: string;
}

export interface MonthlyActivity {
  month: string;
  monthShort: string;
  games: number;
  wins: number;
  losses: number;
}

export interface GameTypeStats {
  type: GameType;
  total: number;
  wins: number;
  losses: number;
}

export interface RecentForm {
  result: "W" | "L";
  date: string;
  opponent: string;
  type: GameType;
}

export interface ScoreDistribution {
  range: string;
  count: number;
}

export interface PlayerStats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  currentStreak: { type: "W" | "L"; count: number };
  bestStreak: number;
  eloProgression: EloPoint[];
  monthlyActivity: MonthlyActivity[];
  byType: Record<GameType, GameTypeStats>;
  recentForm: RecentForm[];
  scoreDistribution: ScoreDistribution[];
  avgScorePerGame: number;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function isWin(game: Game, userId: string): boolean {
  const onTeam1 = game.team1PlayerIds.includes(userId);
  return game.winner === (onTeam1 ? "team1" : "team2");
}

function opponentName(game: Game, userId: string): string {
  const onTeam1 = game.team1PlayerIds.includes(userId);
  const opp = onTeam1 ? game.team2Players : game.team1Players;
  return opp
    .map((p) => p.profile?.name || p.email?.split("@")[0] || "?")
    .join(" & ");
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthShortLabel(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { month: "short" });
}

function sortByDateAsc(a: Game, b: Game): number {
  return new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime();
}

/* ── Main computation ────────────────────────────────────────────────── */

/**
 * Compute comprehensive player statistics from a list of games.
 * This is pure derivation — no extra backend calls needed.
 */
export function computePlayerStats(
  games: Game[],
  userId: string,
  currentElo: number,
  locale = "en-US",
): PlayerStats {
  const playerGames = games
    .filter(
      (g) =>
        g.team1PlayerIds.includes(userId) ||
        g.team2PlayerIds.includes(userId),
    )
    .sort(sortByDateAsc);

  const wins = playerGames.filter((g) => isWin(g, userId)).length;
  const losses = playerGames.length - wins;
  const winRate = playerGames.length > 0 ? (wins / playerGames.length) * 100 : 0;

  /* ELO progression — replay games chronologically from DEFAULT_ELO */
  const eloProgression: EloPoint[] = [];
  let runningElo = DEFAULT_ELO;
  for (const g of playerGames) {
    const won = isWin(g, userId);
    // Approximate opponent ELO as current running ELO (we don't store
    // historical opponent ELO; this gives a visually meaningful trend).
    const oppElo = runningElo;
    const expected = expectedScore(runningElo, oppElo);
    runningElo = newRating(runningElo, expected, won ? 1 : 0);
    const d = new Date(g.playedAt);
    eloProgression.push({
      date: d.toISOString(),
      elo: runningElo,
      label: d.toLocaleDateString(locale, { month: "short", day: "numeric" }),
    });
  }
  // If we have a real current ELO from the backend, anchor the last point
  if (eloProgression.length > 0 && currentElo) {
    eloProgression[eloProgression.length - 1].elo = currentElo;
  }

  /* Monthly activity — last 12 months */
  const now = new Date();
  const monthlyMap = new Map<string, MonthlyActivity>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    monthlyMap.set(key, {
      month: key,
      monthShort: monthShortLabel(d, locale),
      games: 0,
      wins: 0,
      losses: 0,
    });
  }
  for (const g of playerGames) {
    const key = monthKey(new Date(g.playedAt));
    const entry = monthlyMap.get(key);
    if (!entry) continue;
    entry.games++;
    if (isWin(g, userId)) entry.wins++;
    else entry.losses++;
  }
  const monthlyActivity = Array.from(monthlyMap.values());

  /* By type */
  const byType: Record<GameType, GameTypeStats> = {
    SINGLES: { type: "SINGLES", total: 0, wins: 0, losses: 0 },
    DOUBLES: { type: "DOUBLES", total: 0, wins: 0, losses: 0 },
  };
  for (const g of playerGames) {
    const t = g.type;
    byType[t].total++;
    if (isWin(g, userId)) byType[t].wins++;
    else byType[t].losses++;
  }

  /* Recent form — last 10 games, most recent first */
  const recentForm: RecentForm[] = playerGames
    .slice(-10)
    .reverse()
    .map((g) => ({
      result: isWin(g, userId) ? "W" : "L",
      date: new Date(g.playedAt).toLocaleDateString(locale, {
        month: "short",
        day: "numeric",
      }),
      opponent: opponentName(g, userId),
      type: g.type,
    }));

  /* Current streak */
  let streakType: "W" | "L" = "W";
  let streakCount = 0;
  if (playerGames.length > 0) {
    streakType = isWin(playerGames[playerGames.length - 1], userId) ? "W" : "L";
    for (let i = playerGames.length - 1; i >= 0; i--) {
      if (isWin(playerGames[i], userId) === (streakType === "W")) streakCount++;
      else break;
    }
  }

  /* Best win streak */
  let bestStreak = 0;
  let currentRun = 0;
  for (const g of playerGames) {
    if (isWin(g, userId)) {
      currentRun++;
      bestStreak = Math.max(bestStreak, currentRun);
    } else {
      currentRun = 0;
    }
  }

  /* Score distribution — the winner's score per game */
  const scoreBuckets: Record<string, number> = {
    "0-10": 0,
    "11-15": 0,
    "16-20": 0,
    "21-25": 0,
    "26-30": 0,
  };
  let totalScore = 0;
  for (const g of playerGames) {
    const onTeam1 = g.team1PlayerIds.includes(userId);
    const myScore = onTeam1
      ? g.sets.reduce((s, set) => s + set.team1Score, 0)
      : g.sets.reduce((s, set) => s + set.team2Score, 0);
    totalScore += myScore;
    const perSetAvg = g.sets.length > 0 ? myScore / g.sets.length : 0;
    if (perSetAvg <= 10) scoreBuckets["0-10"]++;
    else if (perSetAvg <= 15) scoreBuckets["11-15"]++;
    else if (perSetAvg <= 20) scoreBuckets["16-20"]++;
    else if (perSetAvg <= 25) scoreBuckets["21-25"]++;
    else scoreBuckets["26-30"]++;
  }
  const scoreDistribution = Object.entries(scoreBuckets).map(([range, count]) => ({
    range,
    count,
  }));

  const avgScorePerGame =
    playerGames.length > 0 ? Math.round(totalScore / playerGames.length) : 0;

  return {
    total: playerGames.length,
    wins,
    losses,
    winRate,
    currentStreak: { type: streakType, count: streakCount },
    bestStreak,
    eloProgression,
    monthlyActivity,
    byType,
    recentForm,
    scoreDistribution,
    avgScorePerGame,
  };
}

/* ── Club-level stats for Dashboard ──────────────────────────────────── */

export interface ClubActivity {
  month: string;
  monthShort: string;
  games: number;
}

export interface ClubStats {
  totalGames: number;
  monthlyActivity: ClubActivity[];
  topPlayers: { name: string; games: number; wins: number; winRate: number }[];
  typeSplit: { type: GameType; count: number }[];
}

export function computeClubStats(games: Game[], locale = "en-US"): ClubStats {
  const now = new Date();
  const monthlyMap = new Map<string, ClubActivity>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d);
    monthlyMap.set(key, {
      month: key,
      monthShort: monthShortLabel(d, locale),
      games: 0,
    });
  }
  for (const g of games) {
    const key = monthKey(new Date(g.playedAt));
    const entry = monthlyMap.get(key);
    if (entry) entry.games++;
  }
  const monthlyActivity = Array.from(monthlyMap.values());

  // Top players by game count
  const playerMap = new Map<
    string,
    { name: string; games: number; wins: number }
  >();
  for (const g of games) {
    const allPlayers = [...g.team1Players, ...g.team2Players];
    for (const p of allPlayers) {
      const entry = playerMap.get(p.id) ?? {
        name: p.profile?.name || p.email?.split("@")[0] || "?",
        games: 0,
        wins: 0,
      };
      entry.games++;
      const onTeam1 = g.team1PlayerIds.includes(p.id);
      if (g.winner === (onTeam1 ? "team1" : "team2")) entry.wins++;
      playerMap.set(p.id, entry);
    }
  }
  const topPlayers = Array.from(playerMap.values())
    .map((p) => ({ ...p, winRate: p.games > 0 ? (p.wins / p.games) * 100 : 0 }))
    .sort((a, b) => b.games - a.games)
    .slice(0, 5);

  const typeSplit: { type: GameType; count: number }[] = [
    { type: "SINGLES", count: games.filter((g) => g.type === "SINGLES").length },
    { type: "DOUBLES", count: games.filter((g) => g.type === "DOUBLES").length },
  ];

  return {
    totalGames: games.length,
    monthlyActivity,
    topPlayers,
    typeSplit,
  };
}
