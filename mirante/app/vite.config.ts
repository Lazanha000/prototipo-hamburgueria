import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify((process.env.GITHUB_RUN_NUMBER ? "ci" + process.env.GITHUB_RUN_NUMBER + "-" : "") + pkg.version) },
  plugins: [svelte()],
  base: "./",
  optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
  worker: { format: "es" },
  build: { target: "es2022" },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
