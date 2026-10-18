// Tests run with their own small config: the app's vite.config.ts loads the TanStack
// Start and Cloudflare plugins, which are not needed (and get in the way) here.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node", // files that need a browser add:  // @vitest-environment jsdom
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
