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
  },
  // Prevent vite from obscuring rust compile errors in tauri dev output.
  clearScreen: false,
});
