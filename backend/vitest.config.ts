import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // server.ts is the boot/listen entrypoint — exercised by integration, not unit-covered.
      exclude: ["src/server.ts"],
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 60,
      },
    },
  },
});
