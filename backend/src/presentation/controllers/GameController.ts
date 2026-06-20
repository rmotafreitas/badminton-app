import { GameService } from "@/application/services/GameService";
import type { RegisterGameDto, RegisterQuickGameDto } from "@/application/dtos/game.dto";
import type { GameView } from "@/application/views/game.view";
import { GameMapper } from "@/application/mappers/GameMapper";

export class GameController {
  constructor(private readonly gameService: GameService) {}

  async registerGame(
    currentUser: { sub: string; roles: string[] },
    dto: RegisterGameDto,
  ): Promise<GameView> {
    const game = await this.gameService.registerGame(currentUser, {
      ...dto,
      registeredById: currentUser.sub,
    });
    return GameMapper.toView(game);
  }

  async registerQuickGame(
    currentUser: { sub: string; roles: string[] },
    dto: RegisterQuickGameDto,
  ): Promise<GameView> {
    const game = await this.gameService.registerQuickGame(currentUser, dto);
    return GameMapper.toView(game);
  }

  async getRecentGamesByClub(clubId: string): Promise<GameView[]> {
    const games = await this.gameService.getRecentGames(clubId);
    return games.map(GameMapper.toView);
  }

  async getMyGames(currentUser: { sub: string }): Promise<GameView[]> {
    const games = await this.gameService.getMyGames(currentUser);
    return games.map(GameMapper.toView);
  }

  async getGameById(gameId: string): Promise<GameView> {
    const game = await this.gameService.getGame(gameId);
    return GameMapper.toView(game);
  }

  async deleteGame(
    currentUser: { sub: string; roles: string[] },
    gameId: string,
  ): Promise<{ success: boolean }> {
    await this.gameService.deleteGame(currentUser, gameId);
    return { success: true };
  }

  async updateGame(
    currentUser: { sub: string; roles: string[] },
    gameId: string,
    dto: {
      type?: "SINGLES" | "DOUBLES";
      team1PlayerIds?: string[];
      team2PlayerIds?: string[];
      sets?: { team1Score: number; team2Score: number }[];
      playedAt?: Date;
    },
  ): Promise<GameView> {
    const game = await this.gameService.updateGame(currentUser, gameId, dto);
    return GameMapper.toView(game);
  }
}
