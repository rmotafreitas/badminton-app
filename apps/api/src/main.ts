// Composition root for the long-running server (local dev, Docker). Vercel uses vercel.ts instead.
import { loadConfig } from "@bb/config";
import { composeApp } from "./compose";

const config = loadConfig();
const { app, infra } = composeApp(config);

app.listen({ hostname: config.apiHost, port: config.apiPort });
infra.logger.info("api listening", { url: `http://${config.apiHost}:${config.apiPort}/api/health` });

const shutdown = async (signal: string) => {
  infra.logger.info("shutting down", { signal });
  await app.stop();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
