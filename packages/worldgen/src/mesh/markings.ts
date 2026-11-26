import { hexToLinear, type RGB } from "../color.ts";
import { PALETTE } from "../palette.ts";
import { planMarkings, type StripeColor } from "../resolve/markings.ts";
import type { Tags, Vec2 } from "../types.ts";
import type { MeshBuilder } from "./builder.ts";
import { GridIndex } from "../spatial.ts";
import { arcLengths, dashIntervals, keepIntervals, prepareLine, sampleAt } from "./polyline.ts";
import type { JunctionInfo } from "./roads.ts";

/** Lines stop this far beyond a junction's radius so they don't run through intersections. */
const JUNCTION_CLEARANCE = 1.5;
const DASH_ON = 3;
const DASH_OFF = 4;
/** Zebra crosswalk bars (SPEC: road markings layer). */
const ZEBRA_BAR = 0.5;
const ZEBRA_GAP = 0.5;
const ZEBRA_HALF_WIDTH = 1.5;
/** Lines stop this far from a crosswalk's centerline (zebra half-width plus a gap). */
export const CROSSWALK_CLEARANCE = ZEBRA_HALF_WIDTH + 0.5;

const isMarked = (c: Crossing) => c.tags["crossing"] !== "unmarked" && c.tags["crossing"] !== "no";

/**
 * Arc-length positions (m from the way's first node) where marked crosswalks cross each road, keyed by road id.
 * Used to break lane lines around crosswalks and to put stop bars behind them.
 */
export function findCrossingArcs(roads: readonly MarkedRoad[], crossings: readonly Crossing[]): Map<string, number[]> {
  type Seg = { ax: number; az: number; bx: number; bz: number };
  const grid = new GridIndex<Seg>(16);
  for (const c of crossings) {
    if (!isMarked(c)) continue;
    for (let i = 0; i < c.pts.length - 1; i++) {
      const [ax, az] = c.pts[i]!;
      const [bx, bz] = c.pts[i + 1]!;
      grid.insert({ ax, az, bx, bz }, Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
    }
  }
  const out = new Map<string, number[]>();
  for (const r of roads) {
    const arc = arcLengths(r.pts);
    const hits: number[] = [];
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [px, pz] = r.pts[i]!;
      const [qx, qz] = r.pts[i + 1]!;
      const ex = qx - px;
      const ez = qz - pz;
      const segLen = Math.hypot(ex, ez);
      if (segLen < 1e-6) continue;
      const seen = new Set<Seg>();
      for (const s of grid.query((px + qx) / 2, (pz + qz) / 2, segLen / 2 + 1)) {
        if (seen.has(s)) continue;
        seen.add(s);
        // Segment/segment intersection, endpoints inclusive (crossings usually share a node with the road).
        const fx = s.bx - s.ax;
        const fz = s.bz - s.az;
        const den = ex * fz - ez * fx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((s.ax - px) * fz - (s.az - pz) * fx) / den;
        const u = ((s.ax - px) * ez - (s.az - pz) * ex) / den;
        if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) continue;
        const a = arc[i]! + Math.max(0, Math.min(1, t)) * segLen;
        if (!hits.some((h) => Math.abs(h - a) < 1)) hits.push(a);
      }
    }
    if (hits.length) out.set(r.id, hits.sort((x, y) => x - y));
  }
  return out;
}

export interface MarkedRoad {
  id: string;
  tags: Tags;
  pts: Vec2[];
  nodeIds: number[];
  width: number;
}

export interface Crossing {
  tags: Tags;
  pts: Vec2[];
}

const COLORS: Record<StripeColor, RGB> = {
  white: hexToLinear(PALETTE.roadMarking),
  yellow: hexToLinear(PALETTE.markingYellow),
  bike: hexToLinear(PALETTE.bikeLane),
};

/** Lane lines, center lines and painted bike lanes for every drivable road. Returns the number of stripes drawn. */
export function buildRoadMarkings(
  roads: readonly MarkedRoad[],
  junctions: ReadonlyMap<number, JunctionInfo>,
  crossingArcs: ReadonlyMap<string, readonly number[]>,
  y: number,
  mb: MeshBuilder,
): number {
  let stripes = 0;
  for (const r of roads) {
    const plan = planMarkings(r.tags, r.width);
    if (plan.length === 0) continue;
    const line = prepareLine(r.pts);
    if (!line) continue;

    const raw = arcLengths(r.pts);
    const cuts: [number, number][] = [];
    r.nodeIds.forEach((id, k) => {
      const j = junctions.get(id);
      if (!j) return;
      const c = raw[k]!;
      const reach = j.radius + JUNCTION_CLEARANCE;
      cuts.push([c - reach, c + reach]);
    });
    for (const a of crossingArcs.get(r.id) ?? []) cuts.push([a - CROSSWALK_CLEARANCE, a + CROSSWALK_CLEARANCE]);
    const kept = keepIntervals(line.length, cuts);

    // Bike paint first so lines draw on top of it (depth writes are off for flat layers).
    const ordered = [...plan].sort((a, b) => Number(b.color === "bike") - Number(a.color === "bike"));
    for (const s of ordered) {
      const intervals = s.dashed ? dashIntervals(kept, DASH_ON, DASH_OFF) : kept;
      for (const [a0, a1] of intervals) {
        if (a1 - a0 < 0.3) continue;
        mb.offsetStrip(line, a0, a1, s.offset - s.width / 2, s.offset + s.width / 2, y, COLORS[s.color]);
        stripes++;
      }
    }
  }
  return stripes;
}

/** Zebra stripes on marked crossings, only where the crossing is over a road. */
export function buildCrosswalks(
  crossings: readonly Crossing[],
  onRoad: (x: number, z: number) => boolean,
  y: number,
  mb: MeshBuilder,
): number {
  let bars = 0;
  for (const c of crossings) {
    if (!isMarked(c)) continue;
    const line = prepareLine(c.pts);
    if (!line) continue;
    for (let t = ZEBRA_GAP / 2; t + ZEBRA_BAR <= line.length; t += ZEBRA_BAR + ZEBRA_GAP) {
      const mid = sampleAt(line, t + ZEBRA_BAR / 2, 0).p;
      if (!onRoad(mid[0], mid[1])) continue;
      mb.offsetStrip(line, t, t + ZEBRA_BAR, -ZEBRA_HALF_WIDTH, ZEBRA_HALF_WIDTH, y, COLORS.white);
      bars++;
    }
  }
  return bars;
}
