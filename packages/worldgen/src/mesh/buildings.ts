import { hexToLinear } from "../color.ts";
import { LEVEL_HEIGHT, resolveHeight } from "../resolve/height.ts";
import { buildingColors } from "../resolve/style.ts";
import type { Polygon, Tags } from "../types.ts";
import type { MeshBuilder } from "./builder.ts";
import { orientPolygon } from "./polygon.ts";

export interface BuildingInput {
  id: string;
  tags: Tags;
  /** Cleaned polygon in local meters. */
  poly: Polygon;
}

/** Bottom caps are only needed when the underside is visible (SPEC §8.5 note). */
const BOTTOM_CAP_MIN_BASE = 0.5;
/** Window bay width (SPEC §7.2). */
export const BAY_WIDTH = 3;

/**
 * Extrude footprints into prism buildings with flat roofs (SPEC §6.7).
 * Walls get flat per-face normals (4 vertices per edge). Per-building variation is in vertex colors.
 * Wall UVs drive the procedural window shader (SPEC §7.2): u counts bays along each facade and
 * v counts floors, both rounded to whole numbers so windows always fit the facade evenly.
 */
export function buildBuildings(buildings: readonly BuildingInput[], mb: MeshBuilder): void {
  for (const b of buildings) {
    const { base, top } = resolveHeight(b.id, b.tags);
    const colors = buildingColors(b.id);
    const wall = hexToLinear(colors.wall);
    const roof = hexToLinear(colors.roof);
    const poly = orientPolygon(b.poly);
    const floors = Math.max(1, Math.round((top - base) / LEVEL_HEIGHT));

    for (const ring of poly) {
      for (let i = 0, n = ring.length; i < n; i++) {
        const a = ring[i]!;
        const c = ring[(i + 1) % n]!;
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
        if (len < 1e-3) continue;
        // Facades shorter than ~1.5 m get no bays (u stays in [0, 0]) so the shader draws no windows.
        const bays = len < BAY_WIDTH / 2 ? 0 : Math.max(1, Math.round(len / BAY_WIDTH));
        // Right-of-travel normal is outward thanks to orientPolygon.
        mb.wallQuad(a, c, base, top, wall, 0, bays, 0, floors);
      }
    }

    mb.fillPolygon(poly, top, roof, true);
    if (base >= BOTTOM_CAP_MIN_BASE) mb.fillPolygon(poly, base, wall, false);
  }
}
