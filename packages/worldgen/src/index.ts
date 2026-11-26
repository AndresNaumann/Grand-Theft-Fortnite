// Public API of @polyworld/worldgen. Pure, deterministic functions only (SPEC §4, §15.2).
export { generateWorld } from "./generate.ts";
export { buildOverpassQuery } from "./overpass.ts";
export { parseOsm } from "./parse.ts";
export type { OsmJson, ParsedOsm } from "./parse.ts";
export { makeProjection, projectBBox } from "./project.ts";
export type { Projection } from "./project.ts";
export { resolveHeight, parseLength } from "./resolve/height.ts";
export { resolveRoad } from "./resolve/roadWidth.ts";
export { resolveAreaStyle, buildingColors } from "./resolve/style.ts";
export { GROUND_LAYERS, SIDEWALK_HEIGHT } from "./layers.ts";
export { planMarkings, bikeLaneSides, onewayDirection, roadRank } from "./resolve/markings.ts";
export { abbreviateStreetName } from "./resolve/streetName.ts";
export { PALETTE } from "./palette.ts";
export { hexToLinear } from "./color.ts";
export { rngFor, hashString } from "./rng.ts";
export type { Rng, OsmKey } from "./rng.ts";
export { PROP_STRIDE, TREE_STRIDE } from "./types.ts";
export type * from "./types.ts";
