import type { GameRepo } from "@/core/repositories/interfaces/game-repo";
import type { Game, RegisterGameParams, RegisterQuickGameParams } from "@/core/domain/game";
import type { GameView } from "@/core/views/game.view";
import { GameMapper } from "@/core/mappers/game-mapper";
import api from "@/lib/api";

export class GameRepoImpl implements GameRepo {
  async create(params: RegisterGameParams): Promise<Game> {
    const { data } = await api.post<GameView>("/games", params);
    return GameMapper.toDomain(data);
  }

  async createQuick(params: RegisterQuickGameParams): Promise<Game> {
    const { data } = await api.post<GameView>("/games/quick", params);
    return GameMapper.toDomain(data);
  }

  async getRecentByClub(clubId: string): Promise<Game[]> {
    const { data } = await api.get<GameView[]>(`/games/club/${clubId}`);
    return data.map(GameMapper.toDomain);
  }

  async getMyGames(): Promise<Game[]> {
    const { data } = await api.get<GameView[]>("/games/me");
    return data.map(GameMapper.toDomain);
  }

  async getById(gameId: string): Promise<Game> {
    const { data } = await api.get<GameView>(`/games/${gameId}`);
    return GameMapper.toDomain(data);
  }

  async delete(gameId: string): Promise<void> {
    await api.delete(`/games/${gameId}`);
  }

  async update(gameId: string, params: Partial<RegisterGameParams>): Promise<Game> {
    const { data } = await api.put<GameView>(`/games/${gameId}`, params);
    return GameMapper.toDomain(data);
  }
}
