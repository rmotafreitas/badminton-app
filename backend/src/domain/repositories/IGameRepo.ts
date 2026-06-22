import type { Game, GameType, GameSet } from "../entities/Game";

export interface CreateGameParams {
  type: GameType;
  clubId: string;
  team1PlayerIds: string[];
  team2PlayerIds: string[];
  sets: GameSet[];
  registeredById: string;
  playedAt?: Date;
}

export interface IGameRepo {
  create(data: CreateGameParams): Promise<Game>;
  findRecentByClub(clubId: string): Promise<Game[]>;
  findByPlayerId(playerId: string): Promise<Game[]>;
  findSharedBetween(playerIdA: string, playerIdB: string): Promise<Game[]>;
  findById(id: string): Promise<Game | null>;
  update(id: string, data: Partial<CreateGameParams>): Promise<Game>;
  delete(id: string): Promise<void>;
}
