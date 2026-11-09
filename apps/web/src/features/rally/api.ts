import { queryOptions } from "@tanstack/react-query";
import type { Api } from "@/app/api";
import { edenRallyRepo } from "./eden-repo";

export const rallyKeys = {
  all: ["rally"] as const,
  list: () => ["rally", "list"] as const,
  detail: (id: string) => ["rally", "detail", id] as const,
  game: (gameId: string) => ["rally", "game", gameId] as const,
  profile: (userId: string) => ["rally", "profile", userId] as const,
  usage: () => ["rally", "usage"] as const,
};

export const gameRallyQuery = (api: Api, gameId: string) =>
  queryOptions({ queryKey: rallyKeys.game(gameId), queryFn: () => edenRallyRepo(api).listForGame(gameId) });

export const profileRallyQuery = (api: Api, userId: string) =>
  queryOptions({ queryKey: rallyKeys.profile(userId), queryFn: () => edenRallyRepo(api).profile(userId) });

export const rallySessionsQuery = (api: Api) =>
  queryOptions({ queryKey: rallyKeys.list(), queryFn: () => edenRallyRepo(api).list() });

export const rallySessionQuery = (api: Api, id: string) =>
  queryOptions({ queryKey: rallyKeys.detail(id), queryFn: () => edenRallyRepo(api).get(id) });

export const rallyUsageQuery = (api: Api) => queryOptions({ queryKey: rallyKeys.usage(), queryFn: () => edenRallyRepo(api).usage() });
