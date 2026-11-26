import type { Bounds, BBox, LonLat, Vec2 } from "./types.ts";

/** Meters per degree (SPEC §6.3). */
export const M_PER_DEG_LON_AT_EQUATOR = 111_320;
export const M_PER_DEG_LAT = 110_540;

export interface Projection {
  /** [lon, lat] -> local [x, z] meters. North = -z. */
  toLocal(lon: number, lat: number): Vec2;
  /** Local [x, z] -> [lon, lat]. */
  toLonLat(x: number, z: number): LonLat;
}

/**
 * Local tangent-plane (equirectangular) projection around `origin` (SPEC §6.3).
 * Accurate to well under 1 m over a few km.
 */
export function makeProjection(origin: { lat: number; lon: number }): Projection {
  const kx = Math.cos((origin.lat * Math.PI) / 180) * M_PER_DEG_LON_AT_EQUATOR;
  const kz = M_PER_DEG_LAT;
  return {
    toLocal: (lon, lat) => [(lon - origin.lon) * kx, -(lat - origin.lat) * kz],
    toLonLat: (x, z) => [origin.lon + x / kx, origin.lat - z / kz],
  };
}

/** Project a bbox to local bounds. */
export function projectBBox(bbox: BBox, proj: Projection): Bounds {
  const [south, west, north, east] = bbox;
  const [minX, maxZ] = proj.toLocal(west, south);
  const [maxX, minZ] = proj.toLocal(east, north);
  return { minX, maxX, minZ, maxZ };
}
