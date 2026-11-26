import osmtogeojson from "osmtogeojson";
import type { LonLat, Tags } from "./types.ts";

/** Overpass JSON (`[out:json]`). */
export interface OsmJson {
  elements: OsmElement[];
}

export type OsmElement =
  | { type: "node"; id: number; lat: number; lon: number; tags?: Tags }
  | { type: "way"; id: number; nodes: number[]; tags?: Tags }
  | { type: "relation"; id: number; members: unknown[]; tags?: Tags };

/** A polygon in lon/lat. rings[0] is outer, the rest are holes. Ids look like "way/123" or "relation/456". */
export interface PolygonFeature {
  id: string;
  tags: Tags;
  rings: LonLat[][];
}

export interface LineFeature {
  id: string;
  tags: Tags;
  coords: LonLat[];
  /** OSM node ids, parallel to coords (needed to find junctions). */
  nodeIds: number[];
}

export interface PointFeature {
  id: string;
  tags: Tags;
  coord: LonLat;
}

export interface StreetNode extends PointFeature {
  /** OSM node id (to find the ways the node sits on). */
  nodeId: number;
  kind: StreetNodeKind;
}

export type StreetNodeKind = "stop" | "give_way" | "traffic_signals" | "street_lamp";
const STREET_NODE_KINDS = new Set<string>(["stop", "give_way", "traffic_signals", "street_lamp"]);

export interface ParsedOsm {
  polygons: PolygonFeature[];
  highways: LineFeature[];
  waterways: LineFeature[];
  trees: PointFeature[];
  /** Stop/yield signs, traffic signals and street lamps (M1.5). */
  streetNodes: StreetNode[];
}

const WATERWAY_LINES = new Set(["river", "canal", "stream"]);

/** Tags that make a polygon worth keeping. Everything else (e.g. untagged relation members) is dropped. */
function isInterestingPolygon(tags: Tags): boolean {
  return (
    tags["building"] !== undefined ||
    (tags["building:part"] !== undefined && tags["building:part"] !== "no") ||
    tags["landuse"] !== undefined ||
    tags["leisure"] !== undefined ||
    tags["natural"] !== undefined ||
    tags["waterway"] === "riverbank" ||
    (tags["highway"] !== undefined && tags["area"] === "yes")
  );
}

/**
 * OSM JSON -> typed features (SPEC §4 "parse").
 * Polygons, including multipolygon relations, are assembled by osmtogeojson.
 * Lines are read straight from the ways so node ids survive for junction detection.
 */
export function parseOsm(data: OsmJson): ParsedOsm {
  const nodes = new Map<number, LonLat>();
  const trees: PointFeature[] = [];
  const streetNodes: StreetNode[] = [];
  const seenStreetNodes = new Set<number>();
  for (const el of data.elements) {
    if (el.type !== "node") continue;
    nodes.set(el.id, [el.lon, el.lat]);
    const tags = el.tags;
    if (!tags) continue;
    if (tags["natural"] === "tree") trees.push({ id: `node/${el.id}`, tags, coord: [el.lon, el.lat] });
    const hw = tags["highway"];
    // Overpass may print a node twice (tagged in the union, untagged via `>`); keep the first tagged copy.
    if (hw && STREET_NODE_KINDS.has(hw) && !seenStreetNodes.has(el.id)) {
      seenStreetNodes.add(el.id);
      streetNodes.push({ id: `node/${el.id}`, nodeId: el.id, tags, coord: [el.lon, el.lat], kind: hw as StreetNodeKind });
    }
  }

  const highways: LineFeature[] = [];
  const waterways: LineFeature[] = [];
  for (const el of data.elements) {
    if (el.type !== "way" || !el.tags) continue;
    const isHighway = el.tags["highway"] !== undefined && el.tags["area"] !== "yes";
    const isWaterway = WATERWAY_LINES.has(el.tags["waterway"] ?? "");
    if (!isHighway && !isWaterway) continue;

    const coords: LonLat[] = [];
    const nodeIds: number[] = [];
    for (const nid of el.nodes) {
      const c = nodes.get(nid);
      if (!c) continue;
      coords.push(c);
      nodeIds.push(nid);
    }
    if (coords.length < 2) continue;
    const line = { id: `way/${el.id}`, tags: el.tags, coords, nodeIds };
    (isHighway ? highways : waterways).push(line);
  }

  const polygons: PolygonFeature[] = [];
  const gj = osmtogeojson(data, { flatProperties: false });
  for (const f of gj.features) {
    const g = f.geometry;
    if (g.type !== "Polygon" && g.type !== "MultiPolygon") continue;
    const props = (f.properties ?? {}) as { tags?: Tags };
    const tags = props.tags ?? {};
    if (!isInterestingPolygon(tags)) continue;
    const id = String(f.id);
    const parts = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const rings of parts) {
      polygons.push({ id, tags, rings: rings.map((r) => r.map((p) => [p[0]!, p[1]!] as const)) });
    }
  }

  return { polygons, highways, waterways, trees, streetNodes };
}
