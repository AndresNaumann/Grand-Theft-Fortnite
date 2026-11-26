import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { WORLD } from "./src/config/world.config.ts";

const DATA_DIR = fileURLToPath(new URL("../../data", import.meta.url));

/**
 * Serves the repo-level data/ cache at /data/* in dev, and copies the configured area into the build
 * (SPEC §6.2: dev and production read local/baked data, not public Overpass).
 */
function areaData(): Plugin {
  return {
    name: "polyworld-area-data",
    configureServer(server) {
      server.middlewares.use("/data", (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "").split("?")[0] ?? "").replace(/^\/+/, "");
        const file = normalize(join(DATA_DIR, rel));
        if (!file.startsWith(DATA_DIR + sep) || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-cache");
        createReadStream(file).on("error", next).pipe(res);
      });
    },
    generateBundle() {
      const name = `${WORLD.areaId}.osm.json`;
      const file = join(DATA_DIR, name);
      if (existsSync(file)) {
        this.emitFile({ type: "asset", fileName: `data/${name}`, source: readFileSync(file) });
      } else {
        this.warn(`data/${name} not found; the build will need it at runtime. Run \`pnpm fetch-area\`.`);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), areaData()],
  // Relative base so the build works on GitHub Pages / Cloudflare Pages subpaths.
  base: "./",
  server: { port: 5173 },
  worker: { format: "es" },
});
