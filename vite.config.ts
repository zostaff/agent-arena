import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * GITHUB_PAGES switches the base path to the project-pages sub-path. Set only
 * by .github/workflows/pages.yml; a local build stays at the root so `npm run
 * preview` and a file:// open both behave.
 */
const base = process.env.GITHUB_PAGES ? "/agent-arena/" : "/";

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5173 },
  build: { outDir: "dist", sourcemap: true },
});
