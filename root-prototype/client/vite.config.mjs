import { defineConfig } from "vite";
import checker from "vite-plugin-checker";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  server: {
    open: true,
  },
  plugins: [
    react(),
    hotReload,
    // The build runs `tsc` first; use the checker only during development.
    ...(command === "serve" ? [checker({ typescript: true })] : []),
  ],
}));

function hotReload() {
  return {
    name: "hotreload-hmr",
    enforce: "post",
    // HMR
    handleHotUpdate({ file, server }) {
      console.log(file);
      if (
        file.endsWith(".json") ||
        file.endsWith(".tsx") ||
        file.endsWith(".ts")
      ) {
        console.log("reloading...");

        server.ws.send({
          type: "full-reload",
          path: "*",
        });
      }
    },
  };
}
