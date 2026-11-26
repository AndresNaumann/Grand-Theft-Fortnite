import type { WorldGeometry } from "@polyworld/worldgen";
import { WORLD } from "../config/world.config";
import type { WorkerRequest, WorkerResponse, WorldTimings } from "./protocol";

/** Generate the configured area in a Web Worker. Resolves with transferred (zero-copy) buffers. */
export function loadWorld(): { promise: Promise<{ world: WorldGeometry; timings: WorldTimings }>; cancel: () => void } {
  const worker = new Worker(new URL("./worldgen.worker.ts", import.meta.url), { type: "module" });
  const request: WorkerRequest = {
    source: WORLD.source,
    bbox: WORLD.bbox,
    origin: WORLD.origin,
    dataUrl: new URL(`${import.meta.env.BASE_URL}data/${WORLD.areaId}.osm.json`, window.location.href).href,
  };

  const promise = new Promise<{ world: WorldGeometry; timings: WorldTimings }>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      worker.terminate();
      if (e.data.ok) resolve({ world: e.data.world, timings: e.data.timings });
      else reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "Worldgen worker crashed."));
    };
  });
  worker.postMessage(request);
  return { promise, cancel: () => worker.terminate() };
}
