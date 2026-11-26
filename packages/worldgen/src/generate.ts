import { hexToLinear } from "./color.ts";
import { GROUND_LAYERS, SIDEWALK_HEIGHT } from "./layers.ts";
import { buildAreas, type AreaInput } from "./mesh/areas.ts";
import { MeshBuilder } from "./mesh/builder.ts";
import { buildBuildings, type BuildingInput } from "./mesh/buildings.ts";
import { cleanPolygon, pointInPolygon, ringBounds, ringCentroid } from "./mesh/polygon.ts";
import { planStreetFurniture, type DrivableWay, type StreetNodeInput } from "./mesh/furniture.ts";
import { buildCrosswalks, buildRoadMarkings, findCrossingArcs, type Crossing } from "./mesh/markings.ts";
import { addRaisedDisc, addRaisedRibbon, buildRoadLayer, type RoadInput } from "./mesh/roads.ts";
import { placeTrees, type MappedTree, type ScatterArea } from "./mesh/trees.ts";
import { buildWater, type WaterwayInput } from "./mesh/water.ts";
import { PALETTE } from "./palette.ts";
import { parseOsm, type OsmJson } from "./parse.ts";
import { makeProjection, projectBBox } from "./project.ts";
import { resolveRoad } from "./resolve/roadWidth.ts";
import { resolveAreaStyle } from "./resolve/style.ts";
import { distToSegment2, GridIndex } from "./spatial.ts";
import { PROP_STRIDE, TREE_STRIDE, type LonLat, type Polygon, type Vec2, type WorldGeometry, type WorldgenConfig } from "./types.ts";

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
  const roads: DrivableWay[] = [];
  const footways: RoadInput[] = [];
  const cycleways: RoadInput[] = [];
  const sidewalks: RoadInput[] = [];
  const crossings: Crossing[] = [];
  const segGrid = new GridIndex<Segment>(16);
  const drivableGrid = new GridIndex<Segment>(16);
  for (const h of parsed.highways) {
    const cls = resolveRoad(h.tags);
    if (!cls) continue;
    const pts = toLocal(h.coords);
    const way = { pts, nodeIds: h.nodeIds, halfWidth: cls.width / 2 };
    const footway = h.tags["footway"];
    if (cls.drivable) roads.push({ ...way, id: h.id, tags: h.tags });
    else if (footway === "sidewalk") sidewalks.push(way);
    else if (h.tags["highway"] === "cycleway") cycleways.push(way);
    else footways.push(way);
    if (footway === "crossing" || h.tags["cycleway"] === "crossing") crossings.push({ tags: h.tags, pts });
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]!;
      const [bx, bz] = pts[i + 1]!;
      const s = { ax, az, bx, bz, hw: way.halfWidth };
      // Grow the box by the half-width so queries anywhere on the road surface find the segment.
      const e = way.halfWidth;
      const [x0, z0, x1, z1] = [Math.min(ax, bx) - e, Math.min(az, bz) - e, Math.max(ax, bx) + e, Math.max(az, bz) + e];
      segGrid.insert(s, x0, z0, x1, z1);
      if (cls.drivable) drivableGrid.insert(s, x0, z0, x1, z1);
    }
  }
  const onDrivable = (x: number, z: number) =>
    drivableGrid.query(x, z).some((s) => distToSegment2(x, z, s.ax, s.az, s.bx, s.bz) < s.hw * s.hw);
  const nearRoad = (x: number, z: number) =>
    segGrid
      .query(x, z, TREE_ROAD_CLEARANCE)
      .some((s) => distToSegment2(x, z, s.ax, s.az, s.bx, s.bz) < (s.hw + TREE_ROAD_CLEARANCE) ** 2);

  // ── Meshes ──────────────────────────────────────────────────────────────────────────
  const mbBuildings = new MeshBuilder();
  buildBuildings(buildings, mbBuildings);

  const mbRoads = new MeshBuilder();
  const junctions = buildRoadLayer(roads, GROUND_LAYERS.roads.y, hexToLinear(PALETTE.road), mbRoads);
  const mbFootways = new MeshBuilder();
  buildRoadLayer(footways, GROUND_LAYERS.footways.y, hexToLinear(PALETTE.footway), mbFootways);
  buildRoadLayer(cycleways, GROUND_LAYERS.footways.y, hexToLinear(PALETTE.bikeLane), mbFootways);

  // Raised sidewalks with curbs (M1.5): slabs plus round caps where sidewalk ways meet, so corners have no notches.
  const mbSidewalks = new MeshBuilder();
  const sidewalkTop = hexToLinear(PALETTE.footway);
  const curb = hexToLinear(PALETTE.curb);
  const sidewalkNodes = new Map<number, { x: number; z: number; ways: number; hw: number }>();
  for (const w of sidewalks) {
    addRaisedRibbon(mbSidewalks, w.pts, w.halfWidth, SIDEWALK_HEIGHT, sidewalkTop, curb);
    w.nodeIds.forEach((id, k) => {
      const e = sidewalkNodes.get(id) ?? { x: w.pts[k]![0], z: w.pts[k]![1], ways: 0, hw: 0 };
      e.ways++;
      e.hw = Math.max(e.hw, w.halfWidth);
      sidewalkNodes.set(id, e);
    });
  }
  for (const [, e] of [...sidewalkNodes.entries()].sort((a, b) => a[0] - b[0])) {
    if (e.ways >= 2) addRaisedDisc(mbSidewalks, e.x, e.z, e.hw, SIDEWALK_HEIGHT, sidewalkTop, curb);
  }

  // Road markings (M1.5): lane lines, center lines, bike lanes, crosswalks; stop bars come with the furniture.
  const mbMarkings = new MeshBuilder();
  const markingY = GROUND_LAYERS.markings.y;
  const marked = roads.map((r) => ({ id: r.id, tags: r.tags, pts: r.pts, nodeIds: r.nodeIds, width: r.halfWidth * 2 }));
  const crossingArcs = findCrossingArcs(marked, crossings);
  const stripes = buildRoadMarkings(marked, junctions, crossingArcs, markingY, mbMarkings);
  const crosswalkBars = buildCrosswalks(crossings, onDrivable, markingY, mbMarkings);

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

  // ── Street furniture (M1.5) ───────────────────────────────────────────────────────────
  const streetNodes: StreetNodeInput[] = parsed.streetNodes.map((n) => {
    const [x, z] = proj.toLocal(n.coord[0], n.coord[1]);
    return { id: n.id, nodeId: n.nodeId, kind: n.kind, tags: n.tags, x, z };
  });
  const furniture = planStreetFurniture(
    { streetNodes, roads, junctions, sidewalks: sidewalks.map((s) => s.pts), trees, crossingArcs, inBuilding },
    mbMarkings,
    markingY,
  );

  // ── Spawn: nearest road/footway point to the origin that isn't inside a building ────
  const spawn = findSpawn([...sidewalks, ...footways, ...roads], inBuilding);

  const layers = {
    areas: mbAreas.build(),
    water: mbWater.build(),
    footways: mbFootways.build(),
    roads: mbRoads.build(),
    markings: mbMarkings.build(),
    sidewalks: mbSidewalks.build(),
    buildings: mbBuildings.build(),
  };
  const triangles = Object.values(layers).reduce((n, l) => n + l.indices.length / 3, 0);

  return {
    layers,
    trees,
    furniture,
    spawn,
    bounds,
    stats: {
      buildings: keptOutlines.length,
      buildingParts: parts.length,
      outlinesSkippedForParts,
      roads: roads.length,
      footways: footways.length + cycleways.length,
      areas: areas.length,
      water: water.length + waterways.length,
      trees: trees.length / TREE_STRIDE,
      sidewalks: sidewalks.length,
      stripes,
      crosswalkBars,
      stopSigns: furniture.stopSigns.length / PROP_STRIDE,
      yieldSigns: furniture.yieldSigns.length / PROP_STRIDE,
      trafficLights: furniture.trafficLights.length / PROP_STRIDE,
      streetLamps: furniture.streetLamps.length / PROP_STRIDE,
      nameSigns: furniture.nameSigns.length,
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
