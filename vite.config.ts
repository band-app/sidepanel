import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Vite serves the React frontend. Tauri loads the built `dist/` as
// `frontendDist` in tauri.conf.json, and the dev server on port 1420 in dev.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "127.0.0.1",
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
