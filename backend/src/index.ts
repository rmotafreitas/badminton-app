import { createApp } from "@/app";
import { localHttps } from "elysia-local-https";

const port = parseInt(process.env.PORT ?? "3000");
const useHttps = process.env.ENABLE_LOCAL_HTTPS !== "false";

const app = createApp();
app.listen(useHttps ? localHttps({ port }) : { port });

console.log(
  `Backend running at ${useHttps ? "https" : "http"}://${app.server?.hostname}:${app.server?.port}`,
);
