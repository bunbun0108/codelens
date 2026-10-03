import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // Run unit and integration tests
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["tests/e2e/**", "tests/smoke/**"],
    // Each file gets its own isolated module registry so vi.doMock works correctly
    isolate: true,
    // Globals (describe, it, expect) are available everywhere
    globals: false,
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
