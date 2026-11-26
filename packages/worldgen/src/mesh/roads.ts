import type { RGB } from "../color.ts";
import type { Vec2 } from "../types.ts";
import type { MeshBuilder } from "./builder.ts";

/** Miter length is clamped to this multiple of the half-width (SPEC §6.7: "clamp the miter at 2×"). */
export const MITER_LIMIT = 2;
const DISC_SEGMENTS = 16;

/** Remove consecutive points closer than 1 cm. */
function dedupe(pts: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.01) continue;
    out.push(p);
  }
  return out;
}

/** Flat ribbon along a polyline with mitered joins (SPEC §6.7). */
export function addRibbon(mb: MeshBuilder, pts: readonly Vec2[], halfWidth: number, y: number, color: RGB): void {
  const p = dedupe(pts);
  const n = p.length;
  if (n < 2) return;

  // Left-hand unit normal per segment.
  const nx: number[] = [];
  const nz: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = p[i + 1]![0] - p[i]![0];
    const dz = p[i + 1]![1] - p[i]![1];
    const len = Math.hypot(dx, dz);
    nx.push(-dz / len);
    nz.push(dx / len);
  }

  const L: Vec2[] = [];
  const R: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    let mx: number;
    let mz: number;
    let len = halfWidth;
    if (i === 0 || i === n - 1) {
      const s = i === 0 ? 0 : n - 2;
      mx = nx[s]!;
      mz = nz[s]!;
    } else {
      const sx = nx[i - 1]! + nx[i]!;
      const sz = nz[i - 1]! + nz[i]!;
      const sl = Math.hypot(sx, sz);
      if (sl < 1e-6) {
        mx = nx[i]!;
        mz = nz[i]!;
      } else {
        mx = sx / sl;
        mz = sz / sl;
        const cosHalf = mx * nx[i]! + mz * nz[i]!;
        len = Math.min(halfWidth / Math.max(cosHalf, 1e-6), MITER_LIMIT * halfWidth);
      }
    }
    const [px, pz] = p[i]!;
    L.push([px + mx * len, pz + mz * len]);
    R.push([px - mx * len, pz - mz * len]);
  }

  const li: number[] = [];
  const ri: number[] = [];
  for (let i = 0; i < n; i++) {
    li.push(mb.vertex(L[i]![0], y, L[i]![1], 0, 1, 0, color));
    ri.push(mb.vertex(R[i]![0], y, R[i]![1], 0, 1, 0, color));
  }
  for (let i = 0; i < n - 1; i++) {
    const [l0x, l0z] = L[i]!;
    const [r0x, r0z] = R[i]!;
    const [l1x, l1z] = L[i + 1]!;
    const [r1x, r1z] = R[i + 1]!;
    mb.tri2D(li[i]!, ri[i]!, li[i + 1]!, l0x, l0z, r0x, r0z, l1x, l1z);
    mb.tri2D(ri[i]!, ri[i + 1]!, li[i + 1]!, r0x, r0z, r1x, r1z, l1x, l1z);
  }
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

/**
 * One road layer: a ribbon per way plus a disc at every junction node.
 * A node is a junction when its degree (incident way segments) is >= 3; a through-way counts 2.
 * Discs use the widest incident way's half-width.
 */
export function buildRoadLayer(ways: readonly RoadInput[], y: number, color: RGB, mb: MeshBuilder): number {
  const degree = new Map<number, { count: number; hw: number; x: number; z: number }>();
  for (const w of ways) {
    addRibbon(mb, w.pts, w.halfWidth, y, color);
    const last = w.nodeIds.length - 1;
    w.nodeIds.forEach((id, k) => {
      const d = degree.get(id) ?? { count: 0, hw: 0, x: w.pts[k]![0], z: w.pts[k]![1] };
      d.count += k === 0 || k === last ? 1 : 2;
      d.hw = Math.max(d.hw, w.halfWidth);
      degree.set(id, d);
    });
  }
  let junctions = 0;
  // Sort by node id so output order never depends on Map insertion quirks.
  for (const [, d] of [...degree.entries()].sort((a, b) => a[0] - b[0])) {
    if (d.count < 3) continue;
    addDisc(mb, d.x, d.z, d.hw, y, color);
    junctions++;
  }
  return junctions;
}
