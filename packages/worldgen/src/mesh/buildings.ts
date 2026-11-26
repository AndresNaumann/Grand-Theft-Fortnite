import { hexToLinear } from "../color.ts";
import { resolveHeight } from "../resolve/height.ts";
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

/**
 * Extrude footprints into prism buildings with flat roofs (SPEC §6.7).
 * Walls get flat per-face normals (4 vertices per edge). Per-building variation is in vertex colors.
 */
export function buildBuildings(buildings: readonly BuildingInput[], mb: MeshBuilder): void {
  for (const b of buildings) {
    const { base, top } = resolveHeight(b.id, b.tags);
    const colors = buildingColors(b.id);
    const wall = hexToLinear(colors.wall);
    const roof = hexToLinear(colors.roof);
    const poly = orientPolygon(b.poly);

    for (const ring of poly) {
      for (let i = 0, n = ring.length; i < n; i++) {
        const [ax, az] = ring[i]!;
        const [bx, bz] = ring[(i + 1) % n]!;
        const dx = bx - ax;
        const dz = bz - az;
        const len = Math.hypot(dx, dz);
        if (len < 1e-3) continue;
        // Left-hand normal; outward thanks to orientPolygon.
        const nx = -dz / len;
        const nz = dx / len;
        const a0 = mb.vertex(ax, base, az, nx, 0, nz, wall);
        const b0 = mb.vertex(bx, base, bz, nx, 0, nz, wall);
        const b1 = mb.vertex(bx, top, bz, nx, 0, nz, wall);
        const a1 = mb.vertex(ax, top, az, nx, 0, nz, wall);
        mb.tri(a0, b0, b1);
        mb.tri(a0, b1, a1);
      }
    }

    mb.fillPolygon(poly, top, roof, true);
    if (base >= BOTTOM_CAP_MIN_BASE) mb.fillPolygon(poly, base, wall, false);
  }
}
