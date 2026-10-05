import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";

// HTTP=1: plain HTTP (used behind a tunnel, which supplies real HTTPS).
// ISO=1: cross-origin isolation headers, needed for multi-threaded WASM.
export default defineConfig({
  plugins: process.env.HTTP ? [] : [basicSsl()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    headers: process.env.ISO
      ? { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" }
      : {},
  },
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
});
