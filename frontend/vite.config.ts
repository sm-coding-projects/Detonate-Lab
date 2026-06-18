import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During `vite dev` we proxy /api to the backend so the SPA and API share an
// origin (matching the production nginx setup). In production nginx serves the
// built assets and proxies /api itself.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    // Emit every font as a real file under /assets (no base64 data: URIs),
    // so the strict `font-src 'self'` CSP covers them.
    assetsInlineLimit: 0,
  },
});
