import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import mkcert from "vite-plugin-mkcert";

/**
 * Cross-origin isolation (multithreaded WASM inference) for the Rally Analysis lab page only, so it can't interfere
 * with Google sign-in popups elsewhere in the app.
 */
function crossOriginIsolateLab(): Plugin {
  return {
    name: "cross-origin-isolate-lab",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        const path = (req.url ?? "/").split("?")[0] ?? "/";
        const isAsset = /\.[a-z0-9]+$/i.test(path) && !path.endsWith(".html");
        const isModule = path.startsWith("/@") || path.startsWith("/node_modules/") || path.startsWith("/src/");
        if (req.url?.startsWith("/lab") || isAsset || isModule) {
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // One .env at the repository root (the API reads the same file).
  const env = loadEnv(mode, `${import.meta.dirname}/../..`, "");
  const isLocal = (env.IN_DEV ?? "local") === "local";
  const api = `http://${env.API_HOST ?? "127.0.0.1"}:${env.API_PORT ?? "3000"}`;

  return {
    envDir: "../..",
    // `@/…` from tsconfig "paths"; Vite 8 resolves them natively.
    resolve: { tsconfigPaths: true },
    plugins: [
      // File routes: writes src/routeTree.gen.ts (committed). Each route component is its own chunk.
      tanstackRouter({ target: "react", routesDirectory: "./src/routes", generatedRouteTree: "./src/routeTree.gen.ts", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
      crossOriginIsolateLab(),
      ...(isLocal ? [mkcert()] : []),
    ],
    // ORT ships its own wasm loader; pre-bundling breaks its asset URLs.
    optimizeDeps: { exclude: ["onnxruntime-web"] },
    worker: { format: "es" },
    server: {
      port: 5173,
      host: true,
      allowedHosts: true,
      // Same origin for the browser: /api is proxied to the API with its path kept, so cookies are first-party.
      proxy: { "/api": { target: api, changeOrigin: false } },
    },
    preview: { proxy: { "/api": { target: api, changeOrigin: false } } },
  };
});
