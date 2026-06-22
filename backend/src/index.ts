import { createApp } from "@/app";
import { localHttps } from "elysia-local-https";

const app = createApp();

// IN_DEV controls how the app boots:
//   "local"  -> start a long-running server (Bun .listen) with local HTTPS (your machine / Docker)
//   "vercel" -> serverless: export the Elysia app so Vercel Functions handle requests
const inDev = process.env.IN_DEV ?? "local";

if (inDev === "local") {
  const port = parseInt(process.env.PORT ?? "3000");
  const useHttps = process.env.ENABLE_LOCAL_HTTPS !== "false";

  app.listen(useHttps ? localHttps({ port }) : { port });

  console.log(
    `Backend running at ${useHttps ? "https" : "http"}://${app.server?.hostname}:${app.server?.port}`,
  );
}

export default app;
