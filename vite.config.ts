// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  vite: {
    build: {
      rollupOptions: {
        output: {
          // Firebase is big and changes rarely: in its own file, browsers keep it cached
          // across deploys and only re-download the (small) app code.
          manualChunks(id) {
            if (/node_modules\/(@firebase|firebase)\//.test(id)) return "firebase";
          },
        },
      },
    },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
