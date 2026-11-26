import type { BBox, WorldGeometry } from "@polyworld/worldgen";
import type { WorldSource } from "../config/world.config";

export interface WorkerRequest {
  source: WorldSource;
  bbox: BBox;
  origin: { lat: number; lon: number };
  /** Absolute URL of the area JSON (source "local-json"). */
  dataUrl: string;
}

export interface WorldTimings {
  /** Fetching + JSON parsing of the OSM data. */
  loadMs: number;
  /** generateWorld() inside the worker. */
  generateMs: number;
}

export type WorkerResponse =
  | { ok: true; world: WorldGeometry; timings: WorldTimings }
  | { ok: false; error: string };
