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

    await this.updateElos(game);
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

    await this.updateElos(game);
    return game;
  }

  async getRecentGames(clubId: string): Promise<Game[]> {
    return this.gameRepo.findRecentByClub(clubId);
  }

  async getMyGames(currentUser: { sub: string }): Promise<Game[]> {
    return this.gameRepo.findByPlayerId(currentUser.sub);
  }

  async getGame(gameId: string): Promise<Game> {
    const game = await this.gameRepo.findById(gameId);
    if (!game) throw new Error("Game not found");
    return game;
  }

  async deleteGame(
    currentUser: { sub: string; roles: string[] },
    gameId: string,
  ): Promise<void> {
    const game = await this.gameRepo.findById(gameId);
    if (!game) throw new Error("Game not found");

    if (currentUser.roles.includes("SYSTEM_ADMIN")) {
      await this.gameRepo.delete(gameId);
      return;
    }

    if (
      currentUser.roles.includes("COACH") ||
      currentUser.roles.includes("CLUB_ADMIN")
    ) {
      const user = await this.userRepo.findById(currentUser.sub);
      if (user?.clubId !== game.clubId) {
        throw new Error("You can only delete games from your own club.");
      }
      await this.gameRepo.delete(gameId);
      return;
    }

    if (
      currentUser.roles.includes("PLAYER") &&
      game.registeredById === currentUser.sub
    ) {
      await this.gameRepo.delete(gameId);
      return;
    }

    throw new Error("You don't have permission to delete this game.");
  }

  async updateGame(
    currentUser: { sub: string; roles: string[] },
    gameId: string,
    data: { type?: "SINGLES" | "DOUBLES"; team1PlayerIds?: string[]; team2PlayerIds?: string[]; sets?: { team1Score: number; team2Score: number }[]; playedAt?: Date },
  ): Promise<Game> {
    const game = await this.gameRepo.findById(gameId);
    if (!game) throw new Error("Game not found");

    if (currentUser.roles.includes("SYSTEM_ADMIN")) {
      return this.gameRepo.update(gameId, data);
    }

    if (
      currentUser.roles.includes("COACH") ||
      currentUser.roles.includes("CLUB_ADMIN")
    ) {
      const user = await this.userRepo.findById(currentUser.sub);
      if (user?.clubId !== game.clubId) {
        throw new Error("You can only edit games from your own club.");
      }
      return this.gameRepo.update(gameId, data);
    }

    if (
      currentUser.roles.includes("PLAYER") &&
      game.registeredById === currentUser.sub
    ) {
      return this.gameRepo.update(gameId, data);
    }

    throw new Error("You don't have permission to edit this game.");
  }

  private async updateElos(game: Game): Promise<void> {
    const allIds = [...game.team1PlayerIds, ...game.team2PlayerIds];
    if (allIds.length === 0) return;

    try {
      const players = await this.userRepo.findByIds(allIds);

      const team1Elos = players
        .filter((p) => game.team1PlayerIds.includes(p.id))
        .map((p) => ({ playerId: p.id, elo: p.elo }));
      const team2Elos = players
        .filter((p) => game.team2PlayerIds.includes(p.id))
        .map((p) => ({ playerId: p.id, elo: p.elo }));

      const wonBySetCount1 = game.sets.filter((s) => s.team1Score > s.team2Score).length;
      const wonBySetCount2 = game.sets.filter((s) => s.team2Score > s.team1Score).length;
      const team1Won = wonBySetCount1 > wonBySetCount2;

      const results = calculateElo(team1Elos, team2Elos, team1Won);

      await Promise.all(results.map((r) => this.userRepo.updateElo(r.playerId, r.newElo)));
    } catch (err) {
      console.error("Failed to update ELO ratings:", err);
    }
  }

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
