import type { UserSummary } from "@bb/contracts";
import { queryOptions } from "@tanstack/react-query";
import { type Api, unwrap } from "@/app/api";

/** Every account (system admins). */
export const usersQuery = (api: Api) =>
  queryOptions({ queryKey: ["users"] as const, queryFn: async () => unwrap(await api.users.get()) as UserSummary[] });
