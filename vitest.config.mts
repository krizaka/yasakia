import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "apps/web") },
  },
  // Next keeps JSX as is (tsconfig "jsx": "preserve"); the tests compile it with the automatic runtime.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/web/lib/**/*.test.ts", "scripts/**/*.test.mjs"],
    environment: "node",
  },
});
