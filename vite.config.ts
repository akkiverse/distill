import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:8000", "/auth": "http://localhost:8000" } },
  test: { environment: "jsdom", setupFiles: ["./src/__tests__/setup.ts"], include: ["src/**/*.test.{ts,tsx}"] },
});
