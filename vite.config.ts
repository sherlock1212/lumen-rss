import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Use src/server.ts (our SSR error wrapper) as the server entry.
      server: { entry: "server" },
      // Keep server-only code out of the browser bundle: fail the build if it leaks in.
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    react(),
  ],

  resolve: {
    // The "@/..." imports come from the "paths" in tsconfig.json.
    tsconfigPaths: true,
    // One single copy of these, whatever the dependency tree looks like.
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },

  // `npm run dev` keeps using port 8080 (the one already authorised for sign-in).
  server: { port: 8080 },

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
});
