import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "short-controller-route",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url?.split("?")[0] === "/c")
            req.url = req.url.replace(/^\/c(?=\?|$)/, "/controller.html");
          next();
        });
      },
    },
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    // The HTTPS launcher allows only its generated tunnel hostname.
    allowedHosts: process.env.DINK_PUBLIC_HOST
      ? [process.env.DINK_PUBLIC_HOST]
      : [],
    proxy: {
      // Preserve Host and Origin for the relay's same-origin handshake check.
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
        changeOrigin: false,
      },
      "/health": "http://localhost:3001",
      "/network": "http://localhost:3001",
    },
  },
  build: {
    rollupOptions: {
      input: {
        screen: resolve(import.meta.dirname, "index.html"),
        controller: resolve(import.meta.dirname, "controller.html"),
      },
      output: {
        manualChunks: {
          three: ["three"],
          physics: ["@dimforge/rapier3d-compat"],
        },
      },
    },
  },
});
