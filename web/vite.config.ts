import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@wb/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url))
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: false
      }
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4173
  },
  optimizeDeps: {
    include: ["monaco-editor", "@monaco-editor/react"]
  },
  worker: {
    format: "es"
  }
});
