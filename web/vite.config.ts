import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import mkcert from "vite-plugin-mkcert";

export default defineConfig({
  plugins: [react(), mkcert()],

  server: {
    port: 5173,
    // HTTPS is handled entirely by vite-plugin-mkcert (see plugins above).
    // The plugin generates & trusts certs via mkcert and injects them automatically.

    proxy: {
      "/api": {
        target: "https://localhost:3000",
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
});
