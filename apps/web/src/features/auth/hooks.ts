import type { SessionUser } from "@bb/contracts";
import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useAppContext } from "@/app/context";
import { sessionQuery } from "./api";

/**
 * The signed-in user, live: name, photo and ratings update as soon as the session query revalidates (after a game,
 * a profile edit, or on focus). Only for routes under the authenticated layout.
 */
export function useSessionUser(): SessionUser {
  const { api } = useAppContext();
  const { data } = useQuery(sessionQuery(api));
  // While signing out the query is already null but the layout hasn't unmounted yet: keep the user the guard
  // admitted for that last render instead of crashing.
  const admitted = useRouteContext({ from: "/_app", select: (c) => c.user });
  return data ?? admitted;
}
