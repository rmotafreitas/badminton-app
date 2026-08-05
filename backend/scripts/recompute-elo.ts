/**
 * Recompute ELO script — replays every game chronologically for every club
 * and writes the final `eloSingles` / `eloDoubles` to each user.
 *
 * Run: `bun run db:recompute-elo` (or `bun scripts/recompute-elo.ts`)
 */

import { PrismaClient } from "@prisma/client";
import { PrismaGameRepo } from "../src/application/repositories/PrismaGameRepo";
import { PrismaUserRepo } from "../src/application/repositories/PrismaUserRepo";
import { GameService } from "../src/application/services/GameService";

const prisma = new PrismaClient();

async function main() {
  console.log("Fetching all clubs...");
  const clubs = await prisma.club.findMany({ select: { id: true, name: true } });
  console.log(`Found ${clubs.length} club(s).`);

  const gameRepo = new PrismaGameRepo(prisma);
  const userRepo = new PrismaUserRepo(prisma);
  const gameService = new GameService(gameRepo, userRepo);

  for (const club of clubs) {
    console.log(`\nRecomputing ELOs for club: ${club.name} (${club.id})`);
    const gameCount = await prisma.game.count({ where: { clubId: club.id } });
    console.log(`  Games: ${gameCount}`);
    await gameService.recomputeClubElos(club.id);
    console.log("  Done.");
  }

  // Also reset users who have no club games (their ELOs should be default)
  console.log("\nDone. All ELOs recomputed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
