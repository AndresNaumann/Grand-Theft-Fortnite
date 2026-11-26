/**
 * Worldgen Web Worker (SPEC §10: worldgen never runs on the main thread).
 * Loads OSM data, runs the pure generateWorld(), and transfers the buffers back (zero-copy).
 */
import { buildOverpassQuery, generateWorld, type OsmJson, type WorldGeometry } from "@polyworld/worldgen";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

async function loadOsm(req: WorkerRequest): Promise<OsmJson> {
  switch (req.source) {
    case "local-json": {
      const res = await fetch(req.dataUrl);
      if (!res.ok) {
        throw new Error(
          `Couldn't load ${req.dataUrl} (HTTP ${res.status}). Run \`pnpm fetch-area\` to download the area first.`,
        );
      }
      return (await res.json()) as OsmJson;
    }
    case "overpass-runtime": {
      const res = await fetch(OVERPASS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(buildOverpassQuery(req.bbox))}`,
      });
      if (!res.ok) throw new Error(`Overpass returned HTTP ${res.status}.`);
      return (await res.json()) as OsmJson;
    }
    case "baked-chunks":
      throw new Error("source 'baked-chunks' arrives in M4.");
  }
}

function transferables(world: WorldGeometry): ArrayBuffer[] {
  const f = world.furniture;
  const arrays: ArrayBufferView[] = [world.trees, f.stopSigns, f.yieldSigns, f.trafficLights, f.streetLamps];
  for (const l of Object.values(world.layers)) arrays.push(l.positions, l.normals, l.colors, l.uvs, l.indices);
  return arrays.map((a) => a.buffer as ArrayBuffer);
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    const t0 = performance.now();
    const osm = await loadOsm(req);
    const t1 = performance.now();
    const world = generateWorld(osm, { bbox: req.bbox, origin: req.origin });
    const t2 = performance.now();
    const msg: WorkerResponse = { ok: true, world, timings: { loadMs: t1 - t0, generateMs: t2 - t1 } };
    self.postMessage(msg, { transfer: transferables(world) });
  } catch (err) {
    const msg: WorkerResponse = { ok: false, error: err instanceof Error ? err.message : String(err) };
    self.postMessage(msg);
  }
};
