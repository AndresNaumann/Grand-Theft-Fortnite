import { rngFor } from "../rng.ts";
import { treeVariant } from "../resolve/style.ts";
import { GridIndex } from "../spatial.ts";
import type { Bounds, Polygon, Tags } from "../types.ts";
import { pointInPolygon, ringBounds } from "./polygon.ts";

/** ~1 tree per 80 m² inside wood/park polygons (SPEC §6.7). */
export const TREE_AREA_PER_TREE = 80;
/** No two trees closer than this (m). */
const MIN_TREE_SPACING = 3;

export interface MappedTree {
  id: string;
  tags: Tags;
  x: number;
  z: number;
}

export interface ScatterArea {
  id: string;
  poly: Polygon;
  forest: boolean;
}

export interface TreeBlockers {
  /** True if a scattered tree here would be too close to a road (SPEC: 2 m clearance). */
  nearRoad(x: number, z: number): boolean;
  /** True if inside a building footprint. */
  inBuilding(x: number, z: number): boolean;
}

/**
 * Tree instances: one per mapped `natural=tree` node, plus blue-noise scatter inside wood/park polygons.
 * Scatter uses a jittered grid (one candidate per 80 m² cell), which approximates a Poisson-disc
 * distribution and is deterministic per polygon id. Only trees inside `bounds` are kept.
 */
export function placeTrees(
  mapped: readonly MappedTree[],
  areas: readonly ScatterArea[],
  bounds: Bounds,
  blockers: TreeBlockers,
): Float32Array {
  const out: number[] = [];
  const occupied = new GridIndex<readonly [number, number]>(MIN_TREE_SPACING * 2);
  const inBounds = (x: number, z: number) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
  const crowded = (x: number, z: number) =>
    occupied
      .query(x, z, MIN_TREE_SPACING)
      .some(([ox, oz]) => (ox - x) ** 2 + (oz - z) ** 2 < MIN_TREE_SPACING * MIN_TREE_SPACING);
  const add = (x: number, z: number, scale: number, rot: number, variant: number) => {
    out.push(x, z, scale, rot, variant);
    occupied.insert([x, z], x, z, x, z);
  };

  // Mapped trees always win (street trees sit next to roads by design).
  for (const t of mapped) {
    if (!inBounds(t.x, t.z) || blockers.inBuilding(t.x, t.z)) continue;
    const r = rngFor(t.id, "tree");
    add(t.x, t.z, r.range(0.85, 1.25), r.range(0, Math.PI * 2), treeVariant(t.id, t.tags, false));
  }

  const cell = Math.sqrt(TREE_AREA_PER_TREE);
  for (const a of areas) {
    const outer = a.poly[0];
    if (!outer) continue;
    const bb = ringBounds(outer);
    const x0 = Math.max(bb.minX, bounds.minX);
    const x1 = Math.min(bb.maxX, bounds.maxX);
    const z0 = Math.max(bb.minZ, bounds.minZ);
    const z1 = Math.min(bb.maxZ, bounds.maxZ);
    if (x0 >= x1 || z0 >= z1) continue;

    const r = rngFor(a.id, "scatter");
    // Anchor the grid at a world-aligned origin so overlapping polygons share cells.
    const cx0 = Math.floor(x0 / cell);
    const cz0 = Math.floor(z0 / cell);
    const cx1 = Math.floor(x1 / cell);
    const cz1 = Math.floor(z1 / cell);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        // Always consume the same number of random values per cell, so results don't depend on rejections.
        const x = (cx + 0.1 + 0.8 * r.next()) * cell;
        const z = (cz + 0.1 + 0.8 * r.next()) * cell;
        const scale = r.range(0.8, 1.3);
        const rot = r.range(0, Math.PI * 2);
        const variant = r.next() < (a.forest ? 0.45 : 0.15) ? 1 : 0;
        if (!inBounds(x, z) || !pointInPolygon(x, z, a.poly)) continue;
        if (blockers.nearRoad(x, z) || blockers.inBuilding(x, z) || crowded(x, z)) continue;
        add(x, z, scale, rot, variant);
      }
    }
  }
  return new Float32Array(out);
}

