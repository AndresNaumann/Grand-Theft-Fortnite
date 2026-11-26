import type { Tags } from "../types.ts";

export const LANE_WIDTH = 3.5;

export interface RoadClass {
  width: number;
  drivable: boolean;
}

/** SPEC §6.5. */
const ROAD_TABLE: Readonly<Record<string, RoadClass>> = {
  motorway: { width: 14, drivable: true },
  trunk: { width: 12, drivable: true },
  primary: { width: 10, drivable: true },
  secondary: { width: 9, drivable: true },
  tertiary: { width: 8, drivable: true },
  residential: { width: 6, drivable: true },
  unclassified: { width: 6, drivable: true },
  living_street: { width: 6, drivable: true },
  service: { width: 4, drivable: true },
  pedestrian: { width: 5, drivable: false },
  footway: { width: 2, drivable: false },
  path: { width: 2, drivable: false },
  cycleway: { width: 2, drivable: false },
  steps: { width: 2, drivable: false },
};

/** Ways that exist underground and should not be drawn at grade. */
const UNDERGROUND = new Set(["yes", "building_passage", "culvert"]);

/**
 * Road width and drivability (SPEC §6.5). Returns null for ways that aren't rendered
 * (unknown highway types, tunnels, areas).
 * `*_link` ways use their parent class. `lanes` overrides width when present.
 */
export function resolveRoad(tags: Tags): RoadClass | null {
  const highway = tags["highway"];
  if (!highway) return null;
  if (tags["area"] === "yes") return null;
  if (UNDERGROUND.has(tags["tunnel"] ?? "")) return null;

  const base = ROAD_TABLE[highway] ?? ROAD_TABLE[highway.replace(/_link$/, "")];
  if (!base) return null;

  const lanes = parseInt(tags["lanes"] ?? "", 10);
  if (Number.isFinite(lanes) && lanes > 0) return { width: lanes * LANE_WIDTH, drivable: base.drivable };
  return base;
}
