/**
 * DEV ONLY: adds a season of plausible games between the members of each club, then replays ratings, so the
 * dashboard, games and profile pages have something to show. Refuses non-local databases and clubs that already
 * have games.
 *
 *   bun --env-file=.env scripts/seed-demo.ts
 */
import { createGamesModule, createInfrastructure } from "@bb/bootstrap";
import { loadConfig } from "@bb/config";
import { createDatabase } from "@bb/infrastructure";

const config = loadConfig();
if (!/localhost|127\.0\.0\.1|mongo:/.test(config.databaseUrl)) throw new Error("seed-demo only runs against a local database.");
const db = createDatabase(config.databaseUrl);
const { ratings } = createGamesModule(createInfrastructure(config));

let seed = 42;
const random = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)] as T;
const shuffle = <T>(list: T[]) => [...list].sort(() => random() - 0.5);

function setScore(): { team1Score: number; team2Score: number } {
  const loser = Math.floor(random() * 20);
  const deuce = loser >= 20;
  const winner = deuce ? loser + 2 : 21;
  return random() < 0.5 ? { team1Score: winner, team2Score: loser } : { team1Score: loser, team2Score: winner };
}

for (const club of await db.club.findMany()) {
  if ((await db.game.count({ where: { clubId: club.id } })) > 0) continue;
  const members = await db.user.findMany({ where: { clubId: club.id }, select: { id: true } });
  if (members.length < 4) continue;
  // Some players are simply better: skew results by a hidden strength.
  const strength = new Map(members.map((m) => [m.id, random()]));
  const now = Date.now();
  for (let i = 0; i < 90; i++) {
    const doubles = random() < 0.45;
    const [a, b, c, d] = shuffle(members).map((m) => m.id);
    const team1 = doubles ? [a!, b!] : [a!];
    const team2 = doubles ? [c!, d!] : [b!];
    const power = (team: string[]) => team.reduce((s, id) => s + (strength.get(id) ?? 0.5), 0) / team.length;
    const team1Favoured = random() < 0.5 + (power(team1) - power(team2)) * 0.6;
    const quick = random() < 0.5;
    const sets = Array.from({ length: quick ? 1 : 2 + (random() < 0.4 ? 1 : 0) }, setScore).map((s, idx, all) => {
      // Make the favourite win the deciding set(s).
      if (idx === all.length - 1 || quick) {
        const hi = Math.max(s.team1Score, s.team2Score);
        const lo = Math.min(s.team1Score, s.team2Score);
        return team1Favoured ? { team1Score: hi, team2Score: lo } : { team1Score: lo, team2Score: hi };
      }
      return s;
    });
    const playedAt = new Date(now - (90 - i) * 2.6 * 86_400_000 - random() * 8 * 3_600_000);
    await db.game.create({
      data: { type: doubles ? "DOUBLES" : "SINGLES", clubId: club.id, team1PlayerIds: team1, team2PlayerIds: team2, sets, registeredById: pick(team1), playedAt },
    });
  }
  await ratings.replayClub(club.id, members.map((m) => m.id));
  // biome-ignore lint/suspicious/noConsole: script output
  console.log(`Seeded 90 games for ${club.name}`);
}
await db.$disconnect();
