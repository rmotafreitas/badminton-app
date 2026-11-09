import { Elysia } from "elysia";
import { authentication, csrfGuard, errorHandling, requestContext } from "./http";
import { clubRoutes } from "./modules/clubs/routes";
import { dataRoutes } from "./modules/data/routes";
import type { ApiDeps } from "./modules/deps";
import { gameRoutes } from "./modules/games/routes";
import { identityRoutes } from "./modules/identity/routes";
import { maintenanceRoutes } from "./modules/maintenance";
import { mediaRoutes } from "./modules/media/routes";
import { profileRoutes } from "./modules/profiles/routes";
import { rallyRoutes } from "./modules/rally/routes";
import { registrationRoutes } from "./modules/registrations/routes";
import { trainingRoutes } from "./modules/training/routes";

export type { ApiDeps } from "./modules/deps";

/**
 * HTTP composition only: cross-cutting plugins first, then one module per bounded context. Everything lives under
 * /api, which the web app reaches on its own origin (Vercel rewrite in production, Vite proxy in dev).
 * The Eden client infers its types from `App`.
 */
export function buildApp(deps: ApiDeps) {
  const auth = authentication(deps.resolveSession, deps.clock);
  return new Elysia({ prefix: "/api" })
    .use(requestContext)
    .use(errorHandling(deps.log))
    .use(csrfGuard(deps.appOrigin))
    .get("/health", () => ({ status: "ok" as const }))
    .get("/health/ready", async ({ set }) => {
      const readiness = await deps.checkReadiness.execute();
      if (!readiness.ready) set.status = 503;
      return readiness;
    })
    .use(identityRoutes(auth, deps))
    .use(profileRoutes(auth, deps))
    .use(clubRoutes(auth, deps))
    .use(gameRoutes(auth, deps))
    .use(trainingRoutes(auth, deps))
    .use(rallyRoutes(auth, deps))
    .use(mediaRoutes(auth, deps))
    .use(dataRoutes(auth, deps))
    .use(registrationRoutes(auth, deps))
    .use(maintenanceRoutes(deps));
}

export type App = ReturnType<typeof buildApp>;
