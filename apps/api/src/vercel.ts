// Composition root for Vercel Functions: one app per warm instance, requests go straight to its fetch handler.
import { loadConfig } from "@bb/config";
import { composeApp } from "./compose";

const { app } = composeApp(loadConfig());

export default app;
