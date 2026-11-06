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
        // The page itself, plus everything it loads (worker scripts must carry
        // COEP too for the worker to be isolated).
        const referer = req.headers.referer ?? "";
        const fromLab =
          /^https?:\/\/[^/]+\/lab(\/|\?|$)/.test(referer) || referer.includes("/src/rally/");
        // Same-origin subresources must opt in to being loaded by an isolated
        // context; harmless for every other page.
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        if (req.url?.startsWith("/lab") || fromLab) {
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
