import type { RGB } from "../color.ts";
import type { Vec2 } from "../types.ts";
import type { MeshBuilder } from "./builder.ts";
import { prepareLine } from "./polyline.ts";

export { MITER_LIMIT } from "./polyline.ts";
const DISC_SEGMENTS = 16;

/** Flat ribbon along a polyline with mitered joins (SPEC §6.7). UVs: (arc length m, across -1..1). */
export function addRibbon(mb: MeshBuilder, pts: readonly Vec2[], halfWidth: number, y: number, color: RGB): void {
  const line = prepareLine(pts);
  if (!line) return;
  mb.offsetStrip(line, 0, line.length, -halfWidth, halfWidth, y, color);
}

/**
 * Raised ribbon (a sidewalk slab): top surface at `height` plus curb faces down to y = 0 on both
 * sides and at both ends. Curb faces point outward.
 */
export function addRaisedRibbon(mb: MeshBuilder, pts: readonly Vec2[], halfWidth: number, height: number, top: RGB, curb: RGB): void {
  const line = prepareLine(pts);
  if (!line) return;
  const { left, right } = mb.offsetStrip(line, 0, line.length, -halfWidth, halfWidth, height, top);
  const n = left.length;
  // Right curb walks forward (faces right); left curb walks backward (faces left).
  for (let k = 0; k < n - 1; k++) mb.wallQuad(right[k]!, right[k + 1]!, 0, height, curb);
  for (let k = n - 1; k > 0; k--) mb.wallQuad(left[k]!, left[k - 1]!, 0, height, curb);
  mb.wallQuad(left[0]!, right[0]!, 0, height, curb); // start cap faces backward
  mb.wallQuad(right[n - 1]!, left[n - 1]!, 0, height, curb); // end cap faces forward
}

/** Raised disc (sidewalk corner cap): top at `height` with a curb face around it. */
export function addRaisedDisc(mb: MeshBuilder, x: number, z: number, radius: number, height: number, top: RGB, curb: RGB): void {
  const SEG = 10;
  const ring: Vec2[] = [];
  for (let k = 0; k < SEG; k++) {
    const a = (k / SEG) * Math.PI * 2;
    ring.push([x + Math.cos(a) * radius, z + Math.sin(a) * radius]);
  }
  // v = 9 marks "no paver joints" for the paving shader (ribbon UVs stay within -1..1).
  const center = mb.vertex(x, height, z, 0, 1, 0, top, 0, 9);
  const idx = ring.map(([px, pz]) => mb.vertex(px, height, pz, 0, 1, 0, top, 0, 9));
  for (let k = 0; k < SEG; k++) {
    const k2 = (k + 1) % SEG;
    mb.tri2D(center, idx[k]!, idx[k2]!, x, z, ring[k]![0], ring[k]![1], ring[k2]![0], ring[k2]![1]);
  }
  // Walk the ring backward so each face's right-of-travel normal points outward.
  for (let k = SEG; k > 0; k--) mb.wallQuad(ring[k % SEG]!, ring[k - 1]!, 0, height, curb);
}

/** Flat disc, used as the MVP junction cap (SPEC §6.7). */
export function addDisc(mb: MeshBuilder, x: number, z: number, radius: number, y: number, color: RGB): void {
  const center = mb.vertex(x, y, z, 0, 1, 0, color);
  const ring: number[] = [];
  const pos: Vec2[] = [];
  for (let k = 0; k < DISC_SEGMENTS; k++) {
    const a = (k / DISC_SEGMENTS) * Math.PI * 2;
    const px = x + Math.cos(a) * radius;
    const pz = z + Math.sin(a) * radius;
    pos.push([px, pz]);
    ring.push(mb.vertex(px, y, pz, 0, 1, 0, color));
  }
  for (let k = 0; k < DISC_SEGMENTS; k++) {
    const k2 = (k + 1) % DISC_SEGMENTS;
    mb.tri2D(center, ring[k]!, ring[k2]!, x, z, pos[k]![0], pos[k]![1], pos[k2]![0], pos[k2]![1]);
  }
}

export interface RoadInput {
  pts: Vec2[];
  nodeIds: number[];
  halfWidth: number;
}

export interface JunctionInfo {
  x: number;
  z: number;
  /** Incident way-ends (a through-way counts 2). */
  degree: number;
  /** Widest incident half-width. */
  radius: number;
}

/** Junction nodes (degree >= 3) of a road network, keyed by OSM node id. */
export function findJunctions(ways: readonly RoadInput[]): Map<number, JunctionInfo> {
  const degree = new Map<number, JunctionInfo>();
  for (const w of ways) {
    const last = w.nodeIds.length - 1;
    w.nodeIds.forEach((id, k) => {
      const d = degree.get(id) ?? { degree: 0, radius: 0, x: w.pts[k]![0], z: w.pts[k]![1] };
      d.degree += k === 0 || k === last ? 1 : 2;
      d.radius = Math.max(d.radius, w.halfWidth);
      degree.set(id, d);
    });
  }
  const out = new Map<number, JunctionInfo>();
  // Sort by node id so iteration order never depends on input order quirks.
  for (const [id, d] of [...degree.entries()].sort((a, b) => a[0] - b[0])) if (d.degree >= 3) out.set(id, d);
  return out;
}

/**
 * One road layer: a ribbon per way plus a disc at every junction node.
 * A node is a junction when its degree (incident way segments) is >= 3; a through-way counts 2.
 * Discs use the widest incident way's half-width.
 */
export function buildRoadLayer(ways: readonly RoadInput[], y: number, color: RGB, mb: MeshBuilder): Map<number, JunctionInfo> {
  for (const w of ways) addRibbon(mb, w.pts, w.halfWidth, y, color);
  const junctions = findJunctions(ways);
  for (const j of junctions.values()) addDisc(mb, j.x, j.z, j.radius, y, color);
  return junctions;
}
