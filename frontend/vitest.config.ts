import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["app/**/*.tsx", "lib/**/*.ts"],
      // layout is a pure shell (no logic) per Constitution Rule 8 / testing rules.
      exclude: ["app/layout.tsx"],
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 60,
      },
    },
  },
});
