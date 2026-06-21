import type {
  RegisterGameParams,
  RegisterQuickGameParams,
  Game,
} from "@/core/domain/game";

export interface GameRepo {
  create(params: RegisterGameParams): Promise<Game>;
  createQuick(params: RegisterQuickGameParams): Promise<Game>;
  getRecentByClub(clubId: string): Promise<Game[]>;
  getMyGames(): Promise<Game[]>;
  getGamesByPlayerId(playerId: string): Promise<Game[]>;
  getById(gameId: string): Promise<Game>;
  update(gameId: string, params: Partial<RegisterGameParams>): Promise<Game>;
  delete(gameId: string): Promise<void>;
}
