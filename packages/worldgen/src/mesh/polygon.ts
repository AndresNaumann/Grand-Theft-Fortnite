import earcut from "earcut";
import type { Polygon, Vec2 } from "../types.ts";

const EPS2 = 1e-4; // (1 cm)^2

/** Drop the closing duplicate and consecutive duplicate points. */
export function cleanRing(ring: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (last && (p[0] - last[0]) ** 2 + (p[1] - last[1]) ** 2 < EPS2) continue;
    out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && first && last && (first[0] - last[0]) ** 2 + (first[1] - last[1]) ** 2 < EPS2) out.pop();
  return out;
}

/** Shoelace area in the (x, z) plane. Positive = counter-clockwise when x is right and z is up on paper. */
export function signedArea(ring: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % n]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function polygonArea(poly: Polygon): number {
  let a = 0;
  poly.forEach((ring, i) => (a += Math.abs(signedArea(ring)) * (i === 0 ? 1 : -1)));
  return Math.max(0, a);
}

export function ringBounds(ring: readonly Vec2[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

/** Even-odd point-in-ring test. */
export function pointInRing(x: number, z: number, ring: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(x: number, z: number, poly: Polygon): boolean {
  const outer = poly[0];
  if (!outer || !pointInRing(x, z, outer)) return false;
  for (let i = 1; i < poly.length; i++) if (pointInRing(x, z, poly[i]!)) return false;
  return true;
}

/** Area-weighted centroid of the outer ring (falls back to the vertex average for degenerate rings). */
export function ringCentroid(ring: readonly Vec2[]): Vec2 {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % n]!;
    const f = p[0] * q[1] - q[0] * p[1];
    a += f;
    cx += (p[0] + q[0]) * f;
    cz += (p[1] + q[1]) * f;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0;
    let sz = 0;
    for (const p of ring) {
      sx += p[0];
      sz += p[1];
    }
    return [sx / ring.length, sz / ring.length];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

/**
 * Normalize ring orientation for extrusion: outer ring clockwise (negative signedArea), holes counter-clockwise.
 * With that convention the left-hand normal of every edge points away from the solid.
 */
export function orientPolygon(poly: Polygon): Polygon {
  return poly.map((ring, i) => {
    const area = signedArea(ring);
    const wantNegative = i === 0;
    return (area < 0) === wantNegative ? ring : [...ring].reverse();
  });
}

/** Triangulate a polygon with holes. Returns flat [x, z, ...] coordinates and triangle indices into them. */
export function triangulate(poly: Polygon): { coords: number[]; indices: number[] } {
  const coords: number[] = [];
  const holes: number[] = [];
  poly.forEach((ring, i) => {
    if (i > 0) holes.push(coords.length / 2);
    for (const [x, z] of ring) coords.push(x, z);
  });
  return { coords, indices: earcut(coords, holes.length ? holes : undefined, 2) };
}

/** Clean all rings, dropping degenerate ones. Returns null if the outer ring is degenerate. */
export function cleanPolygon(poly: Polygon, minArea = 0.5): Polygon | null {
  const out: Polygon = [];
  for (let i = 0; i < poly.length; i++) {
    const r = cleanRing(poly[i]!);
    if (r.length < 3 || Math.abs(signedArea(r)) < minArea) {
      if (i === 0) return null;
      continue;
    }
    out.push(r);
  }
  return out;
}
