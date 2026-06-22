import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import mkcert from "vite-plugin-mkcert";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // IN_DEV controls local-only plugins:
  //   "local"  -> enable mkcert HTTPS (matches your current local setup)
  //   "vercel" -> no dev-only plugins; Vercel terminates TLS itself
  const isLocal = (env.IN_DEV ?? process.env.IN_DEV ?? "local") === "local";

  return {
    plugins: [react(), ...(isLocal ? [mkcert()] : [])],

    server: {
      port: 5173,
      watch: {
        ignored: ["**/.env*"],
      },

      proxy: {
        "/api": {
          target: env.VITE_API_URL,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
