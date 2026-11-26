import type { LayerName } from "./types.ts";

/**
 * Flat ground layers (SPEC §6.6). y is baked into the geometry; renderOrder and polygonOffset
 * are applied by the client material. Order matters: later layers draw on top.
 */
export const GROUND_LAYERS = {
  areas: { y: 0.02, renderOrder: 1 },
  water: { y: 0.03, renderOrder: 2 },
  footways: { y: 0.04, renderOrder: 3 },
  roads: { y: 0.05, renderOrder: 4 },
} as const satisfies Partial<Record<LayerName, { y: number; renderOrder: number }>>;
