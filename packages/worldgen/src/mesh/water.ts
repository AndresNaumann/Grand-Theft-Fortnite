import { hexToLinear } from "../color.ts";
import { PALETTE } from "../palette.ts";
import type { Tags, Vec2 } from "../types.ts";
import { buildAreas, type AreaInput } from "./areas.ts";
import type { MeshBuilder } from "./builder.ts";
import { addRibbon } from "./roads.ts";

/** Ribbon widths (m) for waterway centerlines. Rivers are usually also mapped as water polygons. */
const WATERWAY_WIDTH: Readonly<Record<string, number>> = { river: 10, canal: 6, stream: 2 };

export interface WaterwayInput {
  tags: Tags;
  pts: Vec2[];
}

/** Water polygons plus waterway ribbons, all in the water layer. */
export function buildWater(polys: readonly AreaInput[], waterways: readonly WaterwayInput[], y: number, mb: MeshBuilder): void {
  buildAreas(polys, y, mb);
  const color = hexToLinear(PALETTE.water);
  for (const w of waterways) {
    const width = WATERWAY_WIDTH[w.tags["waterway"] ?? ""];
    if (width !== undefined) addRibbon(mb, w.pts, width / 2, y, color);
  }
}
