const K_FACTOR = 32;
const SCALE = 400;

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / SCALE));
}

function newRating(rating: number, expected: number, actual: number): number {
  return Math.round(rating + K_FACTOR * (actual - expected));
}

export interface EloResult {
  playerId: string;
  oldElo: number;
  newElo: number;
  delta: number;
}

export function calculateElo(
  team1Elos: { playerId: string; elo: number }[],
  team2Elos: { playerId: string; elo: number }[],
  team1Won: boolean,
): EloResult[] {
  const avg1 = team1Elos.reduce((s, p) => s + p.elo, 0) / team1Elos.length;
  const avg2 = team2Elos.reduce((s, p) => s + p.elo, 0) / team2Elos.length;

  const expected1 = expectedScore(avg1, avg2);
  const actual1 = team1Won ? 1 : 0;

  const results: EloResult[] = [];

  for (const p of team1Elos) {
    const newElo = newRating(p.elo, expected1, actual1);
    results.push({ playerId: p.playerId, oldElo: p.elo, newElo, delta: newElo - p.elo });
  }

  for (const p of team2Elos) {
    const newElo = newRating(p.elo, 1 - expected1, 1 - actual1);
    results.push({ playerId: p.playerId, oldElo: p.elo, newElo, delta: newElo - p.elo });
  }

  return results;
}
