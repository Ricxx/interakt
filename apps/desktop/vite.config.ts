import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward API calls (and the /api/ws WebSocket) to the Fastify server in dev.
      "/api": { target: "http://localhost:8080", ws: true },
    },
  },
});
