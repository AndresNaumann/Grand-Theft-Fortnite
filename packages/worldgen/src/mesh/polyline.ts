import type { Vec2 } from "../types.ts";

/** Miter length is clamped to this multiple of the offset (SPEC §6.7: "clamp the miter at 2×"). */
export const MITER_LIMIT = 2;

/** Remove consecutive points closer than 1 cm. */
export function dedupe(pts: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.01) continue;
    out.push(p);
  }
  return out;
}

/** Cumulative arc length at each vertex. */
export function arcLengths(pts: readonly Vec2[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) {
    out.push(out[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  }
  return out;
}

/**
 * Unit vector to the RIGHT of travel along a direction (dx, dz), viewed from above with north = -z.
 * Eastbound (1, 0) -> right is south (0, +1).
 */
export function rightOf(dx: number, dz: number): Vec2 {
  const len = Math.hypot(dx, dz) || 1;
  return [-dz / len, dx / len];
}

/**
 * Per-vertex miter directions (unit, pointing right of travel) and miter scale factors (1/cos(θ/2),
 * clamped to MITER_LIMIT). Offsetting vertex i by `s * scale[i]` along `dir[i]` gives a parallel
 * curve at signed distance s (positive = right).
 */
export function miters(pts: readonly Vec2[]): { dir: Vec2[]; scale: number[] } {
  const n = pts.length;
  const segR: Vec2[] = [];
  for (let i = 0; i < n - 1; i++) segR.push(rightOf(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]));
  const dir: Vec2[] = [];
  const scale: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0 || i === n - 1) {
      dir.push(segR[i === 0 ? 0 : n - 2]!);
      scale.push(1);
      continue;
    }
    const a = segR[i - 1]!;
    const b = segR[i]!;
    const sx = a[0] + b[0];
    const sz = a[1] + b[1];
    const sl = Math.hypot(sx, sz);
    if (sl < 1e-6) {
      dir.push(b);
      scale.push(1);
      continue;
    }
    const m: Vec2 = [sx / sl, sz / sl];
    const cosHalf = m[0] * b[0] + m[1] * b[1];
    dir.push(m);
    scale.push(Math.min(1 / Math.max(cosHalf, 1e-6), MITER_LIMIT));
  }
  return { dir, scale };
}

/** A centerline prepared for offset strips: deduped points, arc lengths, miters. */
export interface PreparedLine {
  pts: Vec2[];
  arc: number[];
  length: number;
  dir: Vec2[];
  scale: number[];
}

export function prepareLine(points: readonly Vec2[]): PreparedLine | null {
  const pts = dedupe(points);
  if (pts.length < 2) return null;
  const arc = arcLengths(pts);
  const { dir, scale } = miters(pts);
  return { pts, arc, length: arc[arc.length - 1]!, dir, scale };
}

/** Point at signed offset s (right-positive) from vertex i. */
export function offsetAt(line: PreparedLine, i: number, s: number): Vec2 {
  const p = line.pts[i]!;
  const d = line.dir[i]!;
  const k = s * line.scale[i]!;
  return [p[0] + d[0] * k, p[1] + d[1] * k];
}

/**
 * Point on the offset curve at arc length a (clamped), interpolating within the containing segment.
 * Also returns the segment's travel direction.
 */
export function sampleAt(line: PreparedLine, a: number, s: number): { p: Vec2; dir: Vec2; seg: number } {
  const t = Math.max(0, Math.min(line.length, a));
  let i = 0;
  while (i < line.arc.length - 2 && line.arc[i + 1]! < t) i++;
  const a0 = line.arc[i]!;
  const a1 = line.arc[i + 1]!;
  const f = a1 > a0 ? (t - a0) / (a1 - a0) : 0;
  const p0 = offsetAt(line, i, s);
  const p1 = offsetAt(line, i + 1, s);
  const c0 = line.pts[i]!;
  const c1 = line.pts[i + 1]!;
  const len = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) || 1;
  return {
    p: [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f],
    dir: [(c1[0] - c0[0]) / len, (c1[1] - c0[1]) / len],
    seg: i,
  };
}

/** Subtract [lo, hi] ranges from [0, length]; returns the kept intervals in order. */
export function keepIntervals(length: number, cuts: readonly (readonly [number, number])[]): [number, number][] {
  const sorted = [...cuts].map(([a, b]) => [Math.max(0, a), Math.min(length, b)] as const).filter(([a, b]) => b > a);
  sorted.sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  let cursor = 0;
  for (const [a, b] of sorted) {
    if (a > cursor) out.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < length) out.push([cursor, length]);
  return out;
}

/** Split intervals into dashes of `on` meters separated by `off` meters, phase starting at each interval start. */
export function dashIntervals(intervals: readonly (readonly [number, number])[], on: number, off: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of intervals) {
    for (let t = a; t < b; t += on + off) out.push([t, Math.min(b, t + on)]);
  }
  return out;
}
