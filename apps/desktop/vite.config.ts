import { copyFileSync, createReadStream, existsSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const host = process.env.TAURI_DEV_HOST;
const patchBg = resolve(__dirname, "../../data/bg.jpg");

function patchBackground(): Plugin {
  return {
    name: "patch-background",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/bg.jpg") {
          next();
          return;
        }
        if (!existsSync(patchBg)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "no-cache");
        createReadStream(patchBg).pipe(res);
      });
    },
    writeBundle(options) {
      if (!existsSync(patchBg) || !options.dir) {
        return;
      }
      copyFileSync(patchBg, resolve(options.dir, "bg.jpg"));
    },
  };
}

export default defineConfig({
  plugins: [react(), patchBackground()],
  resolve: {
    alias: {
      "@wt_sights_editor/core": resolve(__dirname, "../../packages/core/src/index.ts"),
      "@catalog": resolve(__dirname, "../../data/catalog.json"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
  },
});
