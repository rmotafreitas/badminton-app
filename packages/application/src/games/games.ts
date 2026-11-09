import {
  type Actor,
  applyGame,
  BusinessRuleViolation,
  canChangeGame,
  DEFAULT_RATING,
  canViewGame,
  Forbidden,
  type Game,
  type GamePlayer,
  type GameSet,
  type GameType,
  type GameWithPlayers,
  isObjectId,
  lineupProblem,
  NotFound,
  type Ratings,
  registerGameProblem,
  ratingTimeline,
  replayRatings,
  visibleClubGames,
} from "@bb/domain";
import type { UserRepository } from "@/identity";
import type { Clock, Logger } from "@/shared";
import type { GameChanges, GameRepository, PlayerDirectory } from "./ports";

const CLUB_LIST_LIMIT = 200;

/** Attaches players' display data to many games with one directory lookup. */
export async function withPlayers(directory: PlayerDirectory, games: readonly Game[]): Promise<GameWithPlayers[]> {
  const ids = [...new Set(games.flatMap((g) => [...g.team1PlayerIds, ...g.team2PlayerIds]))];
  const players = new Map((ids.length ? await directory.findPlayers(ids) : []).map((p) => [p.id, p]));
  const lookup = (id: string): GamePlayer => players.get(id) ?? { id, name: null, email: null, photoVersion: null };
  return games.map((g) => ({ ...g, team1Players: g.team1PlayerIds.map(lookup), team2Players: g.team2PlayerIds.map(lookup) }));
}

const withPlayersOne = async (directory: PlayerDirectory, game: Game): Promise<GameWithPlayers> =>
  (await withPlayers(directory, [game]))[0] as GameWithPlayers;

/**
 * Ratings: a new game moves its players incrementally; an edit or delete replays the whole club, because it changes
 * every rating computed after the game. Rating failures are logged and never fail the write the user made.
 */
export class RatingService {
  constructor(private readonly deps: { games: GameRepository; users: UserRepository; log: Logger }) {}

  async applyNewGame(game: Game): Promise<void> {
    try {
      const ids = [...game.team1PlayerIds, ...game.team2PlayerIds];
      const players = await this.deps.users.findByIds(ids);
      const table = new Map<string, Ratings>(players.map((p) => [p.id, { singles: p.eloSingles, doubles: p.eloDoubles }]));
      const changes = applyGame(table, game);
      const field = game.type === "SINGLES" ? "eloSingles" : "eloDoubles";
      await this.deps.users.setRatings(changes.map((c) => ({ userId: c.playerId, [field]: c.after })));
    } catch (error) {
      this.deps.log.error("rating update failed", { gameId: game.id, error: String(error) });
    }
  }

  /**
   * `touched`: players of the edited/deleted game. Someone whose only game was deleted has no game left to replay,
   * so they go back to the default rating explicitly.
   */
  async replayClub(clubId: string, touched: readonly string[] = []): Promise<void> {
    try {
      const games = await this.deps.games.listAllByClub(clubId);
      const table = replayRatings(games);
      for (const id of touched) if (!table.has(id)) table.set(id, { singles: DEFAULT_RATING, doubles: DEFAULT_RATING });
      await this.deps.users.setRatings(
        [...table].map(([userId, r]) => ({ userId, eloSingles: r.singles, eloDoubles: r.doubles })),
      );
    } catch (error) {
      this.deps.log.error("rating replay failed", { clubId, error: String(error) });
    }
  }
}

interface Deps {
  readonly games: GameRepository;
  readonly users: UserRepository;
  readonly players: PlayerDirectory;
  readonly ratings: RatingService;
  readonly clock: Clock;
}

export type RegisterGameInput = {
  readonly clubId: string;
  readonly type: GameType;
  readonly team1PlayerIds: readonly string[];
  readonly team2PlayerIds: readonly string[];
  readonly playedAt?: Date;
} & ({ readonly sets: readonly GameSet[] } | { readonly team1Points: number; readonly team2Points: number });

export class RegisterGame {
  constructor(private readonly deps: Deps) {}

  async execute({ actor, input }: { actor: Actor; input: RegisterGameInput }): Promise<GameWithPlayers> {
    const sets = "sets" in input ? input.sets : [{ team1Score: input.team1Points, team2Score: input.team2Points }];
    const lineup = { type: input.type, team1PlayerIds: input.team1PlayerIds, team2PlayerIds: input.team2PlayerIds, sets };
    const problem = lineupProblem(lineup);
    if (problem) throw new BusinessRuleViolation(problem, "invalid_lineup");
    const playerIds = [...input.team1PlayerIds, ...input.team2PlayerIds];
    const permission = registerGameProblem(actor, input.clubId, playerIds);
    if (permission) throw new Forbidden(permission);
    await this.assertPlayersExist(playerIds);
    const game = await this.deps.games.create({
      ...lineup,
      clubId: input.clubId,
      registeredById: actor.userId,
      playedAt: input.playedAt ?? this.deps.clock.now(),
    });
    await this.deps.ratings.applyNewGame(game);
    return withPlayersOne(this.deps.players, game);
  }

  private async assertPlayersExist(ids: readonly string[]) {
    if (!ids.every(isObjectId) || (await this.deps.users.findByIds(ids)).length !== new Set(ids).size) {
      throw new BusinessRuleViolation("Some players don't exist.", "unknown_player");
    }
  }
}

async function loadVisible(deps: Pick<Deps, "games">, actor: Actor, gameId: string): Promise<Game> {
  const game = isObjectId(gameId) ? await deps.games.findById(gameId) : null;
  if (!game || !canViewGame(actor, game)) throw new NotFound("Game not found.");
  return game;
}

export class GetGame {
  constructor(private readonly deps: Pick<Deps, "games" | "players">) {}
  async execute({ actor, gameId }: { actor: Actor; gameId: string }): Promise<GameWithPlayers> {
    return withPlayersOne(this.deps.players, await loadVisible(this.deps, actor, gameId));
  }
}

export class UpdateGame {
  constructor(private readonly deps: Deps) {}
  async execute({ actor, gameId, changes }: { actor: Actor; gameId: string; changes: GameChanges }): Promise<GameWithPlayers> {
    const game = await loadVisible(this.deps, actor, gameId);
    if (!canChangeGame(actor, game)) throw new Forbidden();
    const next = {
      type: changes.type ?? game.type,
      team1PlayerIds: changes.team1PlayerIds ?? game.team1PlayerIds,
      team2PlayerIds: changes.team2PlayerIds ?? game.team2PlayerIds,
      sets: changes.sets ?? game.sets,
    };
    const problem = lineupProblem(next);
    if (problem) throw new BusinessRuleViolation(problem, "invalid_lineup");
    const updated = await this.deps.games.update(gameId, changes);
    await this.deps.ratings.replayClub(game.clubId, [...game.team1PlayerIds, ...game.team2PlayerIds]);
    return withPlayersOne(this.deps.players, updated);
  }
}

export class DeleteGame {
  constructor(private readonly deps: Pick<Deps, "games" | "ratings">) {}
  async execute({ actor, gameId }: { actor: Actor; gameId: string }): Promise<void> {
    const game = await loadVisible(this.deps, actor, gameId);
    if (!canChangeGame(actor, game)) throw new Forbidden();
    await this.deps.games.delete(gameId);
    await this.deps.ratings.replayClub(game.clubId, [...game.team1PlayerIds, ...game.team2PlayerIds]);
  }
}

/** The club's recent games: staff of the club and admins see all, players only their own. */
export class ListClubGames {
  constructor(private readonly deps: Pick<Deps, "games" | "players">) {}
  async execute({ actor, clubId }: { actor: Actor; clubId: string }): Promise<GameWithPlayers[]> {
    if (!isObjectId(clubId)) return [];
    const games = await this.deps.games.listByClub(clubId, CLUB_LIST_LIMIT);
    return withPlayers(this.deps.players, visibleClubGames(actor, clubId, games));
  }
}

/** Games a player played in, filtered to what the caller may see. `playerId` = the caller for "my games". */
export class ListPlayerGames {
  constructor(private readonly deps: Pick<Deps, "games" | "players">) {}
  async execute({ actor, playerId }: { actor: Actor; playerId: string }): Promise<GameWithPlayers[]> {
    if (!isObjectId(playerId)) return [];
    const games = await this.deps.games.listByPlayer(playerId);
    return withPlayers(this.deps.players, games.filter((g) => canViewGame(actor, g)));
  }
}

/** Head-to-head and partner history between the caller and another player. */
export class ListSharedGames {
  constructor(private readonly deps: Pick<Deps, "games" | "players">) {}
  async execute({ actor, playerId }: { actor: Actor; playerId: string }): Promise<GameWithPlayers[]> {
    if (!isObjectId(playerId)) return [];
    return withPlayers(this.deps.players, await this.deps.games.listShared(actor.userId, playerId));
  }
}

/** A player's rating after each game, for the profile chart. Ratings are public within the app, like profiles. */
export class GetRatingHistory {
  constructor(private readonly deps: Pick<Deps, "games">) {}
  async execute({ playerId }: { actor: Actor; playerId: string }) {
    if (!isObjectId(playerId)) return { singles: [], doubles: [] };
    const clubIds = [...new Set((await this.deps.games.listByPlayer(playerId)).map((g) => g.clubId))];
    const games = (await Promise.all(clubIds.map((id) => this.deps.games.listAllByClub(id)))).flat();
    return ratingTimeline(games, playerId);
  }
}
