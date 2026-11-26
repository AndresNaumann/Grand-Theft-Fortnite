import { PALETTE } from "../palette.ts";
import { rngFor, type OsmKey } from "../rng.ts";
import type { Tags } from "../types.ts";

/** Wall and roof colors, picked by seeded RNG keyed by OSM id (SPEC §7.1). */
export function buildingColors(id: OsmKey): { wall: string; roof: string } {
  return {
    wall: rngFor(id, "wall").pick(PALETTE.walls),
    roof: rngFor(id, "roof").pick(PALETTE.roofs),
  };
}

export type AreaKind = "water" | "forest" | "grass" | "park" | "pitch" | "beach" | "plaza";

export interface AreaStyle {
  kind: AreaKind;
  color: string;
  /** Draw order inside the layer; higher draws on top. */
  priority: number;
  /** Scatter trees inside (SPEC §6.7). */
  trees: boolean;
}

const STYLES: Readonly<Record<AreaKind, AreaStyle>> = {
  water: { kind: "water", color: PALETTE.water, priority: 0, trees: false },
  forest: { kind: "forest", color: PALETTE.forest, priority: 1, trees: true },
  grass: { kind: "grass", color: PALETTE.grass, priority: 2, trees: false },
  park: { kind: "park", color: PALETTE.park, priority: 3, trees: true },
  pitch: { kind: "pitch", color: PALETTE.grass, priority: 4, trees: false },
  beach: { kind: "beach", color: PALETTE.sand, priority: 5, trees: false },
  plaza: { kind: "plaza", color: PALETTE.footway, priority: 6, trees: false },
};

/**
 * Classify an area polygon by its tags. Returns null for areas that aren't drawn
 * (e.g. urban landuse, which shows as the plain ground color).
 */
export function resolveAreaStyle(tags: Tags): AreaStyle | null {
  const { natural, landuse, leisure, waterway, highway } = tags;
  if (natural === "water" || waterway === "riverbank" || landuse === "reservoir" || landuse === "basin") {
    return STYLES.water;
  }
  if (natural === "beach" || natural === "sand") return STYLES.beach;
  if (natural === "wood" || landuse === "forest") return STYLES.forest;
  if (leisure === "park" || leisure === "garden") return STYLES.park;
  if (leisure === "pitch" || leisure === "playground") return STYLES.pitch;
  if (natural === "scrub") return STYLES.park;
  if (
    natural === "grassland" ||
    landuse === "grass" ||
    landuse === "meadow" ||
    landuse === "recreation_ground" ||
    landuse === "village_green"
  ) {
    return STYLES.grass;
  }
  if (highway === "pedestrian" && tags["area"] === "yes") return STYLES.plaza;
  return null;
}

/** Tree variant for a scattered or mapped tree: 1 = conifer, 0 = round. */
export function treeVariant(id: OsmKey, tags: Tags | undefined, forest: boolean): 0 | 1 {
  if (tags?.["leaf_type"] === "needleleaved") return 1;
  if (tags?.["leaf_type"] === "broadleaved") return 0;
  return rngFor(id, "variant").next() < (forest ? 0.45 : 0.15) ? 1 : 0;
}
