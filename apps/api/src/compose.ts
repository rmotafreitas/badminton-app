import { createInfrastructure, createModules, type InfrastructureOverrides } from "@bb/bootstrap";
import type { Config } from "@bb/config";
import { buildApp } from "./app";

/** The production app from a config: adapters → use cases → HTTP. Shared by the local server and Vercel. */
export function composeApp(config: Config, overrides: InfrastructureOverrides = {}) {
  const infra = createInfrastructure(config, overrides);
  const modules = createModules(infra, { appOrigin: config.appOrigin, registrationOpen: config.registrationOpen });
  const app = buildApp({
    ...modules,
    clock: infra.clock,
    log: infra.logger,
    appOrigin: config.appOrigin,
    cronSecret: config.cronSecret,
  });
  return { app, infra };
}
