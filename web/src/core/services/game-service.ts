import type { GameService } from "@/core/services/interfaces/game-service";
import type { GameRepo } from "@/core/repositories/interfaces/game-repo";
import type {
  RegisterGameParams,
  RegisterQuickGameParams,
  Game,
} from "@/core/domain/game";

export class GameServiceImpl implements GameService {
  private readonly gameRepo: GameRepo;

  constructor(gameRepo: GameRepo) {
    this.gameRepo = gameRepo;
  }

  async registerGame(params: RegisterGameParams): Promise<Game> {
    return this.gameRepo.create(params);
  }

  async registerQuickGame(params: RegisterQuickGameParams): Promise<Game> {
    return this.gameRepo.createQuick(params);
  }

  async getRecentGames(clubId: string): Promise<Game[]> {
    return this.gameRepo.getRecentByClub(clubId);
  }

  async getMyGames(): Promise<Game[]> {
    return this.gameRepo.getMyGames();
  }

  async getGamesByPlayerId(playerId: string): Promise<Game[]> {
    return this.gameRepo.getGamesByPlayerId(playerId);
  }

  async getGameById(gameId: string): Promise<Game> {
    return this.gameRepo.getById(gameId);
  }

  async deleteGame(gameId: string): Promise<void> {
    return this.gameRepo.delete(gameId);
  }

  async updateGame(
    gameId: string,
    params: Partial<RegisterGameParams>,
  ): Promise<Game> {
    return this.gameRepo.update(gameId, params);
  }
}
