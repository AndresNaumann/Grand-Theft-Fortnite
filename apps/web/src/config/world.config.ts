/**
 * World configuration (SPEC §6.1). Changing the area is a one-line edit here.
 * In M0 only `spawn` and the feature flags are used; bbox/origin drive worldgen from M1.
 */
export const WORLD = {
  areaId: "boston-back-bay",
  // Overpass bbox order: south, west, north, east
  bbox: [42.344, -71.09, 42.356, -71.07] as const,
  origin: { lat: 42.35, lon: -71.08 }, // local (0,0,0)
  source: "overpass-runtime" as "overpass-runtime" | "local-json" | "baked-chunks",

  /** Player spawn in local meters (y-up, north = -z). */
  spawn: [0, 2, 0] as const,

  features: {
    /** M0 placeholder props (steps, walls, ramp) for testing movement. Removed once real city geometry lands. */
    testCourse: true,
  },
} as const;
