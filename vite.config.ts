import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Pages serves the village from its own domain (public/CNAME →
 * degenvillage.se), so the bundle lives at the root everywhere: locally, in
 * `npm run preview` and in the published build.
 */
const base = "/";

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5173 },
  build: { outDir: "dist", sourcemap: true },
});
