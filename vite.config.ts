import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Tauri expects a fixed dev port and relative asset paths.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "es2022",
    // Tauri loads the dist folder directly.
    outDir: "dist",
    rolldownOptions: {
      output: {
        // Big, rarely-changing libraries get their own cacheable chunks;
        // views and the importer are split via dynamic import().
        codeSplitting: {
          groups: [
            {
              name: "markdown",
              test: /node_modules[\\/](react-markdown|remark-|micromark|mdast-|unified|vfile|hast-|unist-|property-information|decode-named|character-|space-separated|comma-separated|html-url|trim-lines|devlop|bail|ccount|zwitch|longest-streak|markdown-table|escape-string|is-plain-obj|trough|estree-util|style-to|inline-style)/,
            },
            { name: "motion", test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  // Prevent vite from obscuring rust compile errors in tauri dev output.
  clearScreen: false,
});
