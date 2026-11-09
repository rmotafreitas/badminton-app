/**
 * Replays every club's games chronologically and writes the resulting singles/doubles ratings.
 *
 *   bun run db:recompute-elo
 */
import { createGamesModule, createInfrastructure } from "@bb/bootstrap";
import { loadConfig } from "@bb/config";
import { createDatabase } from "@bb/infrastructure";

const config = loadConfig();
const infra = createInfrastructure(config);
const { ratings } = createGamesModule(infra);
const db = createDatabase(config.databaseUrl);

for (const club of await db.club.findMany({ select: { id: true, name: true } })) {
  const players = await db.user.findMany({ where: { clubId: club.id }, select: { id: true } });
  await ratings.replayClub(club.id, players.map((p) => p.id));
  // biome-ignore lint/suspicious/noConsole: script output
  console.log(`Recomputed ${club.name}`);
}
await db.$disconnect();
