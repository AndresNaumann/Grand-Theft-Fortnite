import { hexToLinear } from "../color.ts";
import type { AreaStyle } from "../resolve/style.ts";
import type { Polygon } from "../types.ts";
import type { MeshBuilder } from "./builder.ts";

export interface AreaInput {
  id: string;
  poly: Polygon;
  style: AreaStyle;
}

/**
 * Flat filled polygons (landuse, leisure, natural, water) per SPEC §6.7.
 * Sorted by style priority so that, with depth writes off, overlapping areas resolve by draw order.
 */
export function buildAreas(areas: readonly AreaInput[], y: number, mb: MeshBuilder): void {
  const sorted = [...areas].sort((a, b) => a.style.priority - b.style.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const a of sorted) mb.fillPolygon(a.poly, y, hexToLinear(a.style.color), true);
}
