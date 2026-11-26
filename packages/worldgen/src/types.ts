/** Shared types for worldgen. Units are meters, y-up, north = -z (SPEC §6.3, §15.4). */

export type Tags = Readonly<Record<string, string>>;

/** GeoJSON order: [lon, lat]. */
export type LonLat = readonly [number, number];

/** Local ground-plane coordinate: [x, z] in meters. */
export type Vec2 = readonly [number, number];

/** Polygon in local coordinates: rings[0] is the outer ring, the rest are holes. Rings are open (no repeated closing point). */
export type Polygon = Vec2[][];

/** Overpass bbox order: south, west, north, east. */
export type BBox = readonly [south: number, west: number, north: number, east: number];

export interface WorldgenConfig {
  bbox: BBox;
  origin: { lat: number; lon: number };
}

/** One merged, indexed triangle mesh. Colors are linear RGB (three.js vertex-color convention). */
export interface MeshBuffers {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

export type LayerName = "areas" | "water" | "footways" | "roads" | "buildings";

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Floats per tree instance: x, z, scale, rotationY, variant (0 = round, 1 = conifer). */
export const TREE_STRIDE = 5;

export interface WorldGeometry {
  layers: Record<LayerName, MeshBuffers>;
  /** Packed tree instances, TREE_STRIDE floats each. */
  trees: Float32Array;
  /** Suggested player spawn (capsule center), on a road or footway near the origin. */
  spawn: [number, number, number];
  /** The configured bbox in local meters. */
  bounds: Bounds;
  stats: {
    buildings: number;
    buildingParts: number;
    outlinesSkippedForParts: number;
    roads: number;
    footways: number;
    areas: number;
    water: number;
    trees: number;
    triangles: number;
  };
}
