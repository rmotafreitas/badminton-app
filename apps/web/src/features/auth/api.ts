import type { CompleteSignInBody, SessionUser } from "@bb/contracts";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { type Api, unwrap } from "@/app/api";

export const sessionKey = ["session"] as const;

export const sessionQuery = (api: Api) =>
  queryOptions({
    queryKey: sessionKey,
    queryFn: async () => unwrap(await api.auth.session.get())?.user ?? null,
    staleTime: 5 * 60_000,
  });

export const readSession = (queryClient: QueryClient): SessionUser | null | undefined =>
  queryClient.getQueryData<SessionUser | null>(sessionKey);

export const writeSession = (queryClient: QueryClient, user: SessionUser | null) =>
  queryClient.setQueryData<SessionUser | null>(sessionKey, user);

export async function completeSignIn(api: Api, body: CompleteSignInBody): Promise<SessionUser> {
  return unwrap(await api.auth["sign-in"].complete.post(body)).user;
}

export async function signOutRequest(api: Api) {
  unwrap(await api.auth["sign-out"].post());
}
