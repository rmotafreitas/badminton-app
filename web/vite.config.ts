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
        // Only /lab is an isolated *document*. Every non-document response
        // (scripts, worker modules and their imports) also carries COEP so a
        // worker started by /lab stays isolated: WebKit sends no Referer for a
        // worker's nested imports, so they can't be told apart. COEP on a
        // subresource of a non-isolated page has no effect.
        const dest = req.headers["sec-fetch-dest"];
        const isDocument =
          dest === "document" || dest === "iframe" || (!dest && (req.headers.accept ?? "").includes("text/html"));
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
