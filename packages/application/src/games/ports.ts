import type { Game, GamePlayer, GameSet, GameType } from "@bb/domain";

export interface NewGame {
  readonly type: GameType;
  readonly clubId: string;
  readonly team1PlayerIds: readonly string[];
  readonly team2PlayerIds: readonly string[];
  readonly sets: readonly GameSet[];
  readonly registeredById: string;
  readonly playedAt: Date;
}

export type GameChanges = Partial<Pick<NewGame, "type" | "team1PlayerIds" | "team2PlayerIds" | "sets" | "playedAt">>;

export interface GameRepository {
  create(input: NewGame): Promise<Game>;
  findById(id: string): Promise<Game | null>;
  update(id: string, changes: GameChanges): Promise<Game>;
  delete(id: string): Promise<void>;
  /** Most recently played first. */
  listByClub(clubId: string, limit: number): Promise<Game[]>;
  /** Every game of the club, for a rating replay. */
  listAllByClub(clubId: string): Promise<Game[]>;
  listByPlayer(userId: string): Promise<Game[]>;
  listShared(userA: string, userB: string): Promise<Game[]>;
}

/** Display data for many players in ONE query (no N+1 per game). */
export interface PlayerDirectory {
  findPlayers(ids: readonly string[]): Promise<GamePlayer[]>;
}
