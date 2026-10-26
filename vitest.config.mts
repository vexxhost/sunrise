import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    exclude: ["artifacts/**", "e2e/**", "node_modules/**"],
    globals: true,
  },
});
