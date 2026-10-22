import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const target = process.env.HG_API ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target, changeOrigin: true },
      "/mcp": { target, changeOrigin: true },
    },
  },
});
