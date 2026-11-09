import type { QueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { Api } from "./api";
import type { CachePersistence } from "./cache-persistence";

/** Router context: what every loader, guard and component may depend on. The client's DI mechanism. */
export interface AppContext {
  readonly queryClient: QueryClient;
  readonly api: Api;
  readonly persistence: CachePersistence;
}

export function useAppContext(): AppContext {
  return useRouter().options.context;
}
