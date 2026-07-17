import { defineConfig } from "vitest/config";

// `@/*` resolves from tsconfig's paths, the same way vite.config.ts does it.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
