import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest resolves `@/*` itself: the app's Vite config uses tsconfigPaths, which
// isn't loaded here, so the alias is declared explicitly.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
