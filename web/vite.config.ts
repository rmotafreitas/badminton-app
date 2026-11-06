import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import mkcert from "vite-plugin-mkcert";

/**
 * Cross-origin isolation (enables multithreaded WASM inference) for the
 * Rally Analysis lab page only, so it can't interfere with Google sign-in
 * popups elsewhere in the app.
 */
function crossOriginIsolateLab(): Plugin {
  return {
    name: "cross-origin-isolate-lab",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Same-origin subresources must opt in to being loaded by an isolated
        // context; harmless for every other page.
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        // Only /lab is an isolated *document*. Scripts and worker modules
        // (and their imports) also carry COEP so a worker started by /lab
        // stays isolated: WebKit sends no Referer for a worker's nested
        // imports, so they can't be told apart. HTML and app routes never get
        // it — not even when fetched as a non-document (the service worker
        // caches the app shell), or the whole app would become isolated and
        // cross-origin video (S3) would be blocked.
        const path = (req.url ?? "/").split("?")[0]!;
        const isAsset = /\.[a-z0-9]+$/i.test(path) && !path.endsWith(".html");
        const isModule = path.startsWith("/@") || path.startsWith("/node_modules/") || path.startsWith("/src/");
        const isDocument = !isAsset && !isModule;
        if (req.url?.startsWith("/lab") || !isDocument) {
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // IN_DEV controls local-only plugins:
  //   "local"  -> enable mkcert HTTPS (matches your current local setup)
  //   "vercel" -> no dev-only plugins; Vercel terminates TLS itself
  const isLocal = (env.IN_DEV ?? process.env.IN_DEV ?? "local") === "local";

  return {
    plugins: [react(), crossOriginIsolateLab(), ...(isLocal ? [mkcert()] : [])],

    // ORT ships its own wasm loader; pre-bundling breaks its asset URLs.
    optimizeDeps: { exclude: ["onnxruntime-web"] },
    worker: { format: "es" },

    server: {
      port: 5173,
      host: true,
      allowedHosts: true,
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
