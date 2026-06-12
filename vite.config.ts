import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    // PGlite must stay external: bundling it strips the WASM/data assets it
    // loads relative to its own module path.
    nitro({ rollupConfig: { external: ["@electric-sql/pglite"] } }),
    tanstackStart(),
    viteReact(),
  ],
});
