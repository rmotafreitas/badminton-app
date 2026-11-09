import { ErrorResponseSchema } from "@bb/contracts";
import { Elysia } from "elysia";
import { z } from "zod";
import { currentRequestId } from "@/http";
import type { ApiDeps } from "@/modules/deps";

/**
 * Vercel Cron only (`Authorization: Bearer $CRON_SECRET`). Without a configured secret it always answers 401.
 * Daily: expired review videos, sessions, sign-in codes and rate-limit windows.
 */
export function maintenanceRoutes(deps: ApiDeps) {
  return new Elysia({ name: "module.maintenance", prefix: "/maintenance" }).get(
    "/daily",
    async ({ headers, set, status }) => {
      if (!deps.cronSecret || headers.authorization !== `Bearer ${deps.cronSecret}`) {
        return status(401, { code: "unauthenticated", message: "Cron only.", requestId: currentRequestId(set) });
      }
      const videos = await deps.purgeExpiredVideos.execute();
      const credentials = await deps.purgeExpiredCredentials.execute();
      deps.log.info("daily maintenance", { videos, ...credentials });
      return { videos, ...credentials };
    },
    {
      response: {
        200: z.object({ videos: z.number(), sessions: z.number(), challenges: z.number(), rateLimits: z.number() }),
        401: ErrorResponseSchema,
      },
    },
  );
}
