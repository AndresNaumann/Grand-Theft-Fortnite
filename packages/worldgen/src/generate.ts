import { hexToLinear } from "./color.ts";
import { GROUND_LAYERS } from "./layers.ts";
import { buildAreas, type AreaInput } from "./mesh/areas.ts";
import { MeshBuilder } from "./mesh/builder.ts";
import { buildBuildings, type BuildingInput } from "./mesh/buildings.ts";
import { cleanPolygon, pointInPolygon, ringBounds, ringCentroid } from "./mesh/polygon.ts";
import { buildRoadLayer, type RoadInput } from "./mesh/roads.ts";
import { placeTrees, type MappedTree, type ScatterArea } from "./mesh/trees.ts";
import { buildWater, type WaterwayInput } from "./mesh/water.ts";
import { PALETTE } from "./palette.ts";
import { parseOsm, type OsmJson } from "./parse.ts";
import { makeProjection, projectBBox } from "./project.ts";
import { resolveRoad } from "./resolve/roadWidth.ts";
import { resolveAreaStyle } from "./resolve/style.ts";
import { distToSegment2, GridIndex } from "./spatial.ts";
import { TREE_STRIDE, type LonLat, type Polygon, type Vec2, type WorldGeometry, type WorldgenConfig } from "./types.ts";

/** Scattered trees keep this clearance from road edges (SPEC §6.7). */
const TREE_ROAD_CLEARANCE = 2;
/** Spawn height for the capsule center (m). */
const SPAWN_Y = 1.5;

interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  hw: number;
}

/**
 * OSM JSON -> stylized world geometry (SPEC §4, §6). Pure and deterministic:
 * identical input produces byte-identical buffers.
 */
export function generateWorld(osm: OsmJson, config: WorldgenConfig): WorldGeometry {
  const proj = makeProjection(config.origin);
  const bounds = projectBBox(config.bbox, proj);
  const parsed = parseOsm(osm);
  const toLocal = (pts: readonly LonLat[]): Vec2[] => pts.map(([lon, lat]) => proj.toLocal(lon, lat));

  // ── Classify polygons ────────────────────────────────────────────────────────────────
  const outlines: BuildingInput[] = [];
  const parts: BuildingInput[] = [];
  const areas: AreaInput[] = [];
  const water: AreaInput[] = [];
  for (const f of parsed.polygons) {
    const poly = cleanPolygon(f.rings.map(toLocal));
    if (!poly) continue;
    const part = f.tags["building:part"];
    const building = f.tags["building"];
    if (part !== undefined && part !== "no") parts.push({ id: f.id, tags: f.tags, poly });
    else if (building !== undefined && building !== "no") outlines.push({ id: f.id, tags: f.tags, poly });
    else {
      const style = resolveAreaStyle(f.tags);
      if (!style) continue;
      (style.kind === "water" ? water : areas).push({ id: f.id, poly, style });
    }
  }

  // SPEC §6.4: if a building has parts, render the parts and skip the outline.
  const partCentroids = new GridIndex<Vec2>(64);
  for (const p of parts) {
    const c = ringCentroid(p.poly[0]!);
    partCentroids.insert(c, c[0], c[1], c[0], c[1]);
  }
  let outlinesSkippedForParts = 0;
  const keptOutlines = outlines.filter((o) => {
    const bb = ringBounds(o.poly[0]!);
    const r = Math.max(bb.maxX - bb.minX, bb.maxZ - bb.minZ);
    const hasPart = partCentroids
      .query((bb.minX + bb.maxX) / 2, (bb.minZ + bb.maxZ) / 2, r)
      .some(([x, z]) => pointInPolygon(x, z, o.poly));
    if (hasPart) outlinesSkippedForParts++;
    return !hasPart;
  });
  const buildings = [...keptOutlines, ...parts];

  const buildingGrid = new GridIndex<Polygon>(32);
  for (const b of buildings) {
    const bb = ringBounds(b.poly[0]!);
    buildingGrid.insert(b.poly, bb.minX, bb.minZ, bb.maxX, bb.maxZ);
  }
  const inBuilding = (x: number, z: number) => buildingGrid.query(x, z).some((p) => pointInPolygon(x, z, p));

  // ── Roads and footways ──────────────────────────────────────────────────────────────
  const roads: RoadInput[] = [];
  const footways: RoadInput[] = [];
  const segGrid = new GridIndex<Segment>(16);
  for (const h of parsed.highways) {
    const cls = resolveRoad(h.tags);
    if (!cls) continue;
    const pts = toLocal(h.coords);
    const way = { pts, nodeIds: h.nodeIds, halfWidth: cls.width / 2 };
    (cls.drivable ? roads : footways).push(way);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]!;
      const [bx, bz] = pts[i + 1]!;
      const s = { ax, az, bx, bz, hw: way.halfWidth };
      segGrid.insert(s, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
    }
  }
  const nearRoad = (x: number, z: number) =>
    segGrid
      .query(x, z, 8)
      .some((s) => distToSegment2(x, z, s.ax, s.az, s.bx, s.bz) < (s.hw + TREE_ROAD_CLEARANCE) ** 2);

  // ── Meshes ──────────────────────────────────────────────────────────────────────────
  const mbBuildings = new MeshBuilder();
  buildBuildings(buildings, mbBuildings);

  const mbRoads = new MeshBuilder();
  buildRoadLayer(roads, GROUND_LAYERS.roads.y, hexToLinear(PALETTE.road), mbRoads);
  const mbFootways = new MeshBuilder();
  buildRoadLayer(footways, GROUND_LAYERS.footways.y, hexToLinear(PALETTE.footway), mbFootways);

  const mbAreas = new MeshBuilder();
  buildAreas(areas, GROUND_LAYERS.areas.y, mbAreas);

  const waterways: WaterwayInput[] = parsed.waterways.map((w) => ({ tags: w.tags, pts: toLocal(w.coords) }));
  const mbWater = new MeshBuilder();
  buildWater(water, waterways, GROUND_LAYERS.water.y, mbWater);

  // ── Trees ───────────────────────────────────────────────────────────────────────────
  const mapped: MappedTree[] = parsed.trees.map((t) => {
    const [x, z] = proj.toLocal(t.coord[0], t.coord[1]);
    return { id: t.id, tags: t.tags, x, z };
  });
  const scatter: ScatterArea[] = areas
    .filter((a) => a.style.trees)
    .map((a) => ({ id: a.id, poly: a.poly, forest: a.style.kind === "forest" }));
  const inWater = (x: number, z: number) => water.some((w) => pointInPolygon(x, z, w.poly));
  const trees = placeTrees(mapped, scatter, bounds, {
    nearRoad,
    inBuilding: (x, z) => inBuilding(x, z) || inWater(x, z),
  });

  // ── Spawn: nearest road/footway point to the origin that isn't inside a building ────
  const spawn = findSpawn([...footways, ...roads], inBuilding);

  const layers = {
    areas: mbAreas.build(),
    water: mbWater.build(),
    footways: mbFootways.build(),
    roads: mbRoads.build(),
    buildings: mbBuildings.build(),
  };
  const triangles = Object.values(layers).reduce((n, l) => n + l.indices.length / 3, 0);

  return {
    layers,
    trees,
    spawn,
    bounds,
    stats: {
      buildings: keptOutlines.length,
      buildingParts: parts.length,
      outlinesSkippedForParts,
      roads: roads.length,
      footways: footways.length,
      areas: areas.length,
      water: water.length + waterways.length,
      trees: trees.length / TREE_STRIDE,
      triangles,
    },
  };
}

function findSpawn(ways: readonly RoadInput[], inBuilding: (x: number, z: number) => boolean): [number, number, number] {
  let best: { d2: number; x: number; z: number } | null = null;
  for (const w of ways) {
    for (let i = 0; i < w.pts.length - 1; i++) {
      const [ax, az] = w.pts[i]!;
      const [bx, bz] = w.pts[i + 1]!;
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + az * dz) / len2)) : 0;
      const x = ax + t * dx;
      const z = az + t * dz;
      const d2 = x * x + z * z;
      if ((!best || d2 < best.d2) && !inBuilding(x, z)) best = { d2, x, z };
    }
  }
  return best ? [best.x, SPAWN_Y, best.z] : [0, SPAWN_Y, 0];
}
