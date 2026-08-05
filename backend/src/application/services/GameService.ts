import type {
  IGameRepo,
  CreateGameParams,
} from "@/domain/repositories/IGameRepo";
import type { Game } from "@/domain/entities/Game";
import type { IUserRepo } from "@/domain/repositories/IUserRepo";
import { calculateElo } from "@/application/elo/EloCalculator";

export interface QuickGameParams {
  clubId: string;
  type: "SINGLES" | "DOUBLES";
  team1PlayerIds: string[];
  team2PlayerIds: string[];
  team1Points: number;
  team2Points: number;
  playedAt?: Date;
}

const DEFAULT_ELO = 200;

export class GameService {
  constructor(
    private readonly gameRepo: IGameRepo,
    private readonly userRepo: IUserRepo,
  ) {}

  async registerGame(
    currentUser: { sub: string; roles: string[] },
    data: CreateGameParams,
  ): Promise<Game> {
    await this.validatePermissions(currentUser, data.clubId, [
      ...data.team1PlayerIds,
      ...data.team2PlayerIds,
    ]);

    const game = await this.gameRepo.create({
      ...data,
      registeredById: currentUser.sub,
    });

    await this.updateElosForGame(game);
    return game;
  }

  async registerQuickGame(
    currentUser: { sub: string; roles: string[] },
    data: QuickGameParams,
  ): Promise<Game> {
    await this.validatePermissions(currentUser, data.clubId, [
      ...data.team1PlayerIds,
      ...data.team2PlayerIds,
    ]);

    const game = await this.gameRepo.create({
      type: data.type,
      clubId: data.clubId,
      team1PlayerIds: data.team1PlayerIds,
      team2PlayerIds: data.team2PlayerIds,
      sets: [{ team1Score: data.team1Points, team2Score: data.team2Points }],
      registeredById: currentUser.sub,
      playedAt: data.playedAt,
    });

    await this.updateElosForGame(game);
    return game;
  }

  async getRecentGames(
    currentUser: { sub: string; roles: string[] },
    clubId: string,
  ): Promise<Game[]> {
    const games = await this.gameRepo.findRecentByClub(clubId);

    if (currentUser.roles.includes("SYSTEM_ADMIN")) return games;

    if (
      currentUser.roles.includes("COACH") ||
      currentUser.roles.includes("CLUB_ADMIN")
    ) {
      return games;
    }

    if (currentUser.roles.includes("PLAYER")) {
      return games.filter(
        (g) =>
          g.team1PlayerIds.includes(currentUser.sub) ||
          g.team2PlayerIds.includes(currentUser.sub),
      );
    }

    return [];
  }

  async getMyGames(currentUser: { sub: string }): Promise<Game[]> {
    return this.gameRepo.findByPlayerId(currentUser.sub);
  }

  async getSharedGames(
    currentUser: { sub: string; roles: string[] },
    targetPlayerId: string,
  ): Promise<Game[]> {
    return this.gameRepo.findSharedBetween(currentUser.sub, targetPlayerId);
  }

  async getGamesByPlayerId(
    currentUser: { sub: string; roles: string[] },
    targetPlayerId: string,
  ): Promise<Game[]> {
    const games = await this.gameRepo.findByPlayerId(targetPlayerId);

    if (currentUser.roles.includes("SYSTEM_ADMIN")) return games;

    if (
      currentUser.roles.includes("COACH") ||
      currentUser.roles.includes("CLUB_ADMIN")
    ) {
      const user = await this.userRepo.findById(currentUser.sub);
      return games.filter((g) => g.clubId === user?.clubId);
    }

    if (currentUser.roles.includes("PLAYER")) {
      return games.filter(
        (g) =>
          g.team1PlayerIds.includes(currentUser.sub) ||
          g.team2PlayerIds.includes(currentUser.sub),
      );
    }

    return [];
  }

  async getGame(
    currentUser: { sub: string; roles: string[] },
    gameId: string,
  ): Promise<Game> {
    const game = await this.gameRepo.findById(gameId);
    if (!game) throw new Error("Game not found");

    if (currentUser.roles.includes("SYSTEM_ADMIN")) return game;

    if (
      currentUser.roles.includes("COACH") ||
      currentUser.roles.includes("CLUB_ADMIN")
    ) {
      const user = await this.userRepo.findById(currentUser.sub);
      if (user?.clubId !== game.clubId) {
        throw new Error("You can only view games from your own club.");
      }
      return game;
    }

    if (currentUser.roles.includes("PLAYER")) {
      if (
        !game.team1PlayerIds.includes(currentUser.sub) &&
        !game.team2PlayerIds.includes(currentUser.sub)
      ) {
        throw new Error("You can only view your own games.");
      }
      return game;
    }

    throw new Error("You don't have permission to view this game.");
  }

  async deleteGame(
    currentUser: { sub: string; roles: string[] },
    gameId: string,
  ): Promise<void> {
    const game = await this.gameRepo.findById(gameId);
    if (!game) throw new Error("Game not found");

    const clubId = game.clubId;

    if (currentUser.roles.includes("SYSTEM_ADMIN")) {
      await this.gameRepo.delete(gameId);
    } else if (
      currentUser.roles.includes("COACH") ||
      currentUser.roles.includes("CLUB_ADMIN")
    ) {
      const user = await this.userRepo.findById(currentUser.sub);
      if (user?.clubId !== clubId) {
        throw new Error("You can only delete games from your own club.");
      }
      await this.gameRepo.delete(gameId);
    } else if (
      currentUser.roles.includes("PLAYER") &&
      (game.team1PlayerIds.includes(currentUser.sub) ||
        game.team2PlayerIds.includes(currentUser.sub))
    ) {
      await this.gameRepo.delete(gameId);
    } else {
      throw new Error("You don't have permission to delete this game.");
    }

    // Recompute ELOs after deletion
    await this.recomputeClubElos(clubId);
  }

  async updateGame(
    currentUser: { sub: string; roles: string[] },
    gameId: string,
    data: {
      type?: "SINGLES" | "DOUBLES";
      team1PlayerIds?: string[];
      team2PlayerIds?: string[];
      sets?: { team1Score: number; team2Score: number }[];
      playedAt?: Date;
    },
  ): Promise<Game> {
    const game = await this.gameRepo.findById(gameId);
    if (!game) throw new Error("Game not found");

    let updated: Game;

    if (currentUser.roles.includes("SYSTEM_ADMIN")) {
      updated = await this.gameRepo.update(gameId, data);
    } else if (
      currentUser.roles.includes("COACH") ||
      currentUser.roles.includes("CLUB_ADMIN")
    ) {
      const user = await this.userRepo.findById(currentUser.sub);
      if (user?.clubId !== game.clubId) {
        throw new Error("You can only edit games from your own club.");
      }
      updated = await this.gameRepo.update(gameId, data);
    } else if (
      currentUser.roles.includes("PLAYER") &&
      (game.team1PlayerIds.includes(currentUser.sub) ||
        game.team2PlayerIds.includes(currentUser.sub))
    ) {
      updated = await this.gameRepo.update(gameId, data);
    } else {
      throw new Error("You don't have permission to edit this game.");
    }

    // Recompute ELOs after update
    await this.recomputeClubElos(game.clubId);

    return updated;
  }

  /* ── ELO management ───────────────────────────────────────────────── */

  /** Incremental ELO update for a single new game. */
  private async updateElosForGame(game: Game): Promise<void> {
    const allIds = [...game.team1PlayerIds, ...game.team2PlayerIds];
    if (allIds.length === 0) return;

    try {
      const players = await this.userRepo.findByIds(allIds);

      const team1Elos = players
        .filter((p) => game.team1PlayerIds.includes(p.id))
        .map((p) => ({
          playerId: p.id,
          elo: game.type === "SINGLES" ? p.eloSingles : p.eloDoubles,
        }));
      const team2Elos = players
        .filter((p) => game.team2PlayerIds.includes(p.id))
        .map((p) => ({
          playerId: p.id,
          elo: game.type === "SINGLES" ? p.eloSingles : p.eloDoubles,
        }));

      const wonBySetCount1 = game.sets.filter(
        (s) => s.team1Score > s.team2Score,
      ).length;
      const wonBySetCount2 = game.sets.filter(
        (s) => s.team2Score > s.team1Score,
      ).length;
      const team1Won = wonBySetCount1 > wonBySetCount2;

      const results = calculateElo(team1Elos, team2Elos, team1Won);

      await Promise.all(
        results.map((r) =>
          game.type === "SINGLES"
            ? this.userRepo.updateEloSingles(r.playerId, r.newElo)
            : this.userRepo.updateEloDoubles(r.playerId, r.newElo),
        ),
      );
    } catch (err) {
      console.error("Failed to update ELO ratings:", err);
    }
  }

  /**
   * Full recomputation of all ELOs for every player in a club.
   * Replays all games chronologically, starting from DEFAULT_ELO.
   * Called after game updates/deletions, and by the recompute script.
   */
  async recomputeClubElos(clubId: string): Promise<void> {
    try {
      const games = await this.gameRepo.findRecentByClub(clubId);

      // Collect all unique player IDs
      const playerIds = new Set<string>();
      for (const g of games) {
        g.team1PlayerIds.forEach((id) => playerIds.add(id));
        g.team2PlayerIds.forEach((id) => playerIds.add(id));
      }
      if (playerIds.size === 0) return;

      const players = await this.userRepo.findByIds(Array.from(playerIds));

      // Build per-player ELO state, starting from default
      const eloState = new Map<string, { singles: number; doubles: number }>();
      for (const p of players) {
        eloState.set(p.id, { singles: DEFAULT_ELO, doubles: DEFAULT_ELO });
      }

      // Sort games chronologically and replay
      const sorted = [...games].sort(
        (a, b) => new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime(),
      );

      for (const game of sorted) {
        const team1Elos = game.team1PlayerIds.map((id) => ({
          playerId: id,
          elo: game.type === "SINGLES"
            ? (eloState.get(id)?.singles ?? DEFAULT_ELO)
            : (eloState.get(id)?.doubles ?? DEFAULT_ELO),
        }));
        const team2Elos = game.team2PlayerIds.map((id) => ({
          playerId: id,
          elo: game.type === "SINGLES"
            ? (eloState.get(id)?.singles ?? DEFAULT_ELO)
            : (eloState.get(id)?.doubles ?? DEFAULT_ELO),
        }));

        const wonBySetCount1 = game.sets.filter(
          (s) => s.team1Score > s.team2Score,
        ).length;
        const wonBySetCount2 = game.sets.filter(
          (s) => s.team2Score > s.team1Score,
        ).length;
        const team1Won = wonBySetCount1 > wonBySetCount2;

        const results = calculateElo(team1Elos, team2Elos, team1Won);

        for (const r of results) {
          const state = eloState.get(r.playerId);
          if (state) {
            if (game.type === "SINGLES") state.singles = r.newElo;
            else state.doubles = r.newElo;
          }
        }
      }

      // Write final ELOs back to the database
      await Promise.all(
        Array.from(eloState.entries()).map(([playerId, state]) =>
          Promise.all([
            this.userRepo.updateEloSingles(playerId, state.singles),
            this.userRepo.updateEloDoubles(playerId, state.doubles),
          ]),
        ),
      );
    } catch (err) {
      console.error("Failed to recompute club ELO ratings:", err);
    }
  }

  /* ── Permissions ───────────────────────────────────────────────────── */

  private async validatePermissions(
    currentUser: { sub: string; roles: string[] },
    clubId: string,
    allPlayerIds: string[],
  ): Promise<void> {
    if (currentUser.roles.includes("SYSTEM_ADMIN")) {
      return;
    }

    if (
      currentUser.roles.includes("COACH") ||
      currentUser.roles.includes("CLUB_ADMIN")
    ) {
      const user = await this.userRepo.findById(currentUser.sub);
      if (user?.clubId !== clubId) {
        throw new Error("You can only register games for your own club.");
      }
      return;
    }

    if (currentUser.roles.includes("PLAYER")) {
      if (!allPlayerIds.includes(currentUser.sub)) {
        throw new Error(
          "Players can only register games they participated in.",
        );
      }
    }
  }
}
