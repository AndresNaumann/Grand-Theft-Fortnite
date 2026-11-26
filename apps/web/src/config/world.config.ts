/**
 * World configuration (SPEC §6.1). Changing the area is a one-line edit here
 * (then `pnpm fetch-area` to cache it when using "local-json").
 */
export type WorldSource = "overpass-runtime" | "local-json" | "baked-chunks";

export const WORLD = {
  areaId: "boston-back-bay",
  // Overpass bbox order: south, west, north, east
  bbox: [42.344, -71.09, 42.356, -71.07] as const,
  origin: { lat: 42.35, lon: -71.08 }, // local (0,0,0)
  /** "local-json" reads data/<areaId>.osm.json (see tools/fetch-area). Don't hammer public Overpass (SPEC §12). */
  source: "local-json" as WorldSource,
  /** Invisible walls inset from the bbox edge (SPEC §8.5). */
  boundaryInset: 5,
} as const;
