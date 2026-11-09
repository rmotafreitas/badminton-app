import { buildApp } from "@bb/api/src/app";
import { createModules } from "@bb/bootstrap";
import type { User } from "@bb/domain";
import { fakeInfrastructure } from "@bb/testing";
import { treaty } from "@elysiajs/eden";

export const APP_ORIGIN = "https://app.badminton.test";

/**
 * The whole backend in-process: real HTTP layer and use cases, in-memory adapters. `as(user)` gives a typed Eden
 * client carrying that user's session cookie (and the app's Origin, as a browser on our page would send).
 */
export function testApi(options: { registrationOpen?: boolean; storageConfigured?: boolean; cronSecret?: string } = {}) {
  const fake = fakeInfrastructure({ storageConfigured: options.storageConfigured });
  const { infra, store } = fake;
  const modules = createModules(infra, { appOrigin: APP_ORIGIN, registrationOpen: options.registrationOpen ?? true });
  const app = buildApp({ ...modules, clock: infra.clock, log: infra.logger, appOrigin: APP_ORIGIN, cronSecret: options.cronSecret });

  /** Synchronous on purpose: an async function can't return an Eden client (it is a thenable Proxy). */
  const sessionFor = (user: User) => {
    const token = `session-${user.id}-${Math.random().toString(36).slice(2)}`;
    const id = `${user.id.slice(0, 12)}${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`;
    const expiresAt = new Date(infra.clock.now().getTime() + 30 * 86_400_000);
    store.sessions.set(id, { id, userId: user.id, expiresAt, tokenHash: infra.secrets.hash(token) });
    return `__Host-bb_session=${token}`;
  };

  const client = (headers: Record<string, string> = {}) =>
    treaty(app, { headers: { origin: APP_ORIGIN, "content-type": "application/json", ...headers } }).api;

  return {
    ...fake,
    app,
    modules,
    anonymous: client(),
    as: (user: User) => client({ cookie: sessionFor(user) }),
    sessionFor,
    /** Raw request (for header and CSRF checks). */
    request: (path: string, init: RequestInit = {}) => app.handle(new Request(`https://api.badminton.test${path}`, init)),
    store,
  };
}
