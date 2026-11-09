import type { Game, RatingHistory, RegisterGameBody, UpdateGameBody } from "@bb/contracts";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { type Api, unwrap } from "@/app/api";
import { staleTime } from "@/app/query-client";

export const gameKeys = {
  all: ["games"] as const,
  club: (clubId: string) => ["games", "club", clubId] as const,
  mine: () => ["games", "mine"] as const,
  player: (id: string) => ["games", "player", id] as const,
  shared: (id: string) => ["games", "shared", id] as const,
  detail: (id: string) => ["games", "detail", id] as const,
};

export const clubGamesQuery = (api: Api, clubId: string) =>
  queryOptions({
    queryKey: gameKeys.club(clubId),
    queryFn: async () => unwrap(await api.games.club({ clubId }).get()) as Game[],
    staleTime: staleTime.shared,
    meta: { persist: true },
  });

export const myGamesQuery = (api: Api) =>
  queryOptions({
    queryKey: gameKeys.mine(),
    queryFn: async () => unwrap(await api.games.mine.get()) as Game[],
    staleTime: staleTime.own,
    meta: { persist: true },
  });

export const playerGamesQuery = (api: Api, playerId: string) =>
  queryOptions({
    queryKey: gameKeys.player(playerId),
    queryFn: async () => unwrap(await api.games.player({ playerId }).get()) as Game[],
    meta: { persist: true },
  });

export const sharedGamesQuery = (api: Api, playerId: string) =>
  queryOptions({
    queryKey: gameKeys.shared(playerId),
    queryFn: async () => unwrap(await api.games.shared({ playerId }).get()) as Game[],
    meta: { persist: true },
  });

/** The newest copy of a game already sitting in a list (club, mine, a player's, shared), if any. */
function gameFromLists(queryClient: QueryClient, gameId: string): { game: Game; updatedAt: number } | undefined {
  let best: { game: Game; updatedAt: number } | undefined;
  for (const query of queryClient.getQueryCache().findAll({ queryKey: gameKeys.all })) {
    const data = query.state.data;
    if (!Array.isArray(data)) continue;
    const game = (data as Game[]).find((g) => g.id === gameId);
    if (game && (!best || query.state.dataUpdatedAt > best.updatedAt)) best = { game, updatedAt: query.state.dataUpdatedAt };
  }
  return best;
}

/**
 * One game. Opened from a list it paints at once with the list's copy (same shape) and revalidates in the background,
 * so tapping a game never waits on a sleeping API.
 */
export const gameQuery = (api: Api, gameId: string, queryClient?: QueryClient) =>
  queryOptions({
    queryKey: gameKeys.detail(gameId),
    queryFn: async () => unwrap(await api.games({ id: gameId }).get()) as Game,
    staleTime: staleTime.shared,
    meta: { persist: true },
    ...(queryClient && {
      initialData: () => gameFromLists(queryClient, gameId)?.game,
      initialDataUpdatedAt: () => gameFromLists(queryClient, gameId)?.updatedAt,
    }),
  });

export const registerGame = async (api: Api, body: RegisterGameBody) => unwrap(await api.games.post(body)) as Game;
export const updateGame = async (api: Api, id: string, body: UpdateGameBody) => unwrap(await api.games({ id }).patch(body)) as Game;
export const deleteGame = async (api: Api, id: string) => unwrap(await api.games({ id }).delete());

const byPlayedAtDesc = (a: Game, b: Game) => b.playedAt.localeCompare(a.playedAt);

/**
 * Put the server's answer into every cache that shows it, at once: the detail, and the lists it belongs in (a new
 * game goes into its club's list, and into "mine" when the viewer played). The refetch that follows only fills in what
 * changed elsewhere (ratings).
 */
export function rememberGame(queryClient: QueryClient, game: Game, { isNew, viewerId }: { isNew: boolean; viewerId: string }) {
  const played = [...game.team1Players, ...game.team2Players].some((p) => p.id === viewerId);
  queryClient.setQueryData(gameKeys.detail(game.id), game);
  const lists = queryClient.getQueryCache().findAll({ queryKey: gameKeys.all }).filter((q) => Array.isArray(q.state.data));
  for (const query of lists) {
    const games = query.state.data as Game[];
    const has = games.some((g) => g.id === game.id);
    const [, scope, id] = query.queryKey as readonly string[];
    const belongs = (scope === "mine" && played) || (scope === "club" && id === game.clubId);
    if (has) queryClient.setQueryData<Game[]>(query.queryKey, games.map((g) => (g.id === game.id ? game : g)).sort(byPlayedAtDesc));
    else if (isNew && belongs) queryClient.setQueryData<Game[]>(query.queryKey, [game, ...games].sort(byPlayedAtDesc));
  }
}

/** A deleted game leaves every list at once. */
export function forgetGame(queryClient: QueryClient, gameId: string) {
  queryClient.removeQueries({ queryKey: gameKeys.detail(gameId), exact: true });
  for (const query of queryClient.getQueryCache().findAll({ queryKey: gameKeys.all })) {
    if (Array.isArray(query.state.data)) queryClient.setQueryData<Game[]>(query.queryKey, (query.state.data as Game[]).filter((g) => g.id !== gameId));
  }
}

/**
 * A game changes ratings: every game list, every profile, the club roster (ratings column) and the session user
 * (rating in the header) are refreshed. This is the dependency graph the old hand-written cache never had.
 */
export const invalidateAfterGame = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: gameKeys.all }),
    queryClient.invalidateQueries({ queryKey: ["profiles"] }),
    queryClient.invalidateQueries({ queryKey: ["clubs", "detail"] }),
    queryClient.invalidateQueries({ queryKey: ["session"] }),
  ]);

export const ratingHistoryQuery = (api: Api, playerId: string) =>
  queryOptions({
    queryKey: ["games", "ratings", playerId] as const,
    queryFn: async () => unwrap(await api.games.ratings({ playerId }).get()) as RatingHistory,
    staleTime: staleTime.own,
    meta: { persist: true },
  });
