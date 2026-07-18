import { defineConfig } from "vitest/config";

// `@/*` resolves from tsconfig's paths, the same way vite.config.ts does it.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    // Component tests opt into jsdom per file with a leading
    // `// @vitest-environment jsdom` comment; the DB-backed suites stay on node.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
