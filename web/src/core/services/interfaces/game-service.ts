import type {
  RegisterGameParams,
  RegisterQuickGameParams,
  Game,
} from "@/core/domain/game";

export interface GameService {
  registerGame(params: RegisterGameParams): Promise<Game>;
  registerQuickGame(params: RegisterQuickGameParams): Promise<Game>;
  getRecentGames(clubId: string): Promise<Game[]>;
  getMyGames(): Promise<Game[]>;
  getGamesByPlayerId(playerId: string): Promise<Game[]>;
  getGameById(gameId: string): Promise<Game>;
  updateGame(
    gameId: string,
    params: Partial<RegisterGameParams>,
  ): Promise<Game>;
  deleteGame(gameId: string): Promise<void>;
}
