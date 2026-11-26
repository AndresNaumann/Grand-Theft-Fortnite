import type { RGB } from "../color.ts";
import type { MeshBuffers, Polygon, Vec2 } from "../types.ts";
import { triangulate } from "./polygon.ts";
import { offsetAt, rightOf, sampleAt, type PreparedLine } from "./polyline.ts";

/**
 * Accumulates one merged, indexed, vertex-colored mesh.
 * UVs are in meters-based "detail" space used by the procedural shaders:
 * ribbons: (arc length m, across -1..1); walls: (bays, floors); everything else (0, 0).
 */
export class MeshBuilder {
  private p: number[] = [];
  private n: number[] = [];
  private c: number[] = [];
  private uv: number[] = [];
  private i: number[] = [];

  get vertexCount(): number {
    return this.p.length / 3;
  }

  get triangleCount(): number {
    return this.i.length / 3;
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, color: RGB, u = 0, v = 0): number {
    this.p.push(x, y, z);
    this.n.push(nx, ny, nz);
    this.c.push(color[0], color[1], color[2]);
    this.uv.push(u, v);
    return this.p.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.i.push(a, b, c);
  }

  /** Index a triangle of existing horizontal vertices, choosing the winding so it faces up (or down). */
  tri2D(a: number, b: number, c: number, ax: number, az: number, bx: number, bz: number, cx: number, cz: number, faceUp = true): void {
    const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    if (cross < 0 === faceUp) this.tri(a, b, c);
    else this.tri(a, c, b);
  }

  /** Fill a polygon (with holes) at height y. Shared vertices; winding fixed per triangle. */
  fillPolygon(poly: Polygon, y: number, color: RGB, faceUp = true): void {
    const { coords, indices } = triangulate(poly);
    const ny = faceUp ? 1 : -1;
    const base = this.vertexCount;
    for (let k = 0; k < coords.length; k += 2) this.vertex(coords[k]!, y, coords[k + 1]!, 0, ny, 0, color);
    for (let k = 0; k < indices.length; k += 3) {
      const ia = indices[k]!;
      const ib = indices[k + 1]!;
      const ic = indices[k + 2]!;
      this.tri2D(
        base + ia,
        base + ib,
        base + ic,
        coords[ia * 2]!,
        coords[ia * 2 + 1]!,
        coords[ib * 2]!,
        coords[ib * 2 + 1]!,
        coords[ic * 2]!,
        coords[ic * 2 + 1]!,
        faceUp,
      );
    }
  }

  /** Horizontal quad (two triangles) from four corners in order around the quad, facing up. */
  flatQuad(a: Vec2, b: Vec2, c: Vec2, d: Vec2, y: number, color: RGB): void {
    const ia = this.vertex(a[0], y, a[1], 0, 1, 0, color);
    const ib = this.vertex(b[0], y, b[1], 0, 1, 0, color);
    const ic = this.vertex(c[0], y, c[1], 0, 1, 0, color);
    const id = this.vertex(d[0], y, d[1], 0, 1, 0, color);
    this.tri2D(ia, ib, ic, a[0], a[1], b[0], b[1], c[0], c[1]);
    this.tri2D(ia, ic, id, a[0], a[1], c[0], c[1], d[0], d[1]);
  }

  /** Vertical quad between ground points a -> b from y0 to y1; faces right of travel a -> b. */
  wallQuad(a: Vec2, b: Vec2, y0: number, y1: number, color: RGB, u0 = 0, u1 = 0, v0 = 0, v1 = 0): void {
    const [nx, nz] = rightOf(b[0] - a[0], b[1] - a[1]);
    const a0 = this.vertex(a[0], y0, a[1], nx, 0, nz, color, u0, v0);
    const b0 = this.vertex(b[0], y0, b[1], nx, 0, nz, color, u1, v0);
    const b1 = this.vertex(b[0], y1, b[1], nx, 0, nz, color, u1, v1);
    const a1 = this.vertex(a[0], y1, a[1], nx, 0, nz, color, u0, v1);
    this.tri(a0, b0, b1);
    this.tri(a0, b1, a1);
  }

  /**
   * Horizontal strip along a prepared centerline between arc lengths [a0, a1] and signed offsets
   * [s0, s1] (right-positive). Follows mitered corners. Returns the strip's edge polylines.
   */
  offsetStrip(line: PreparedLine, a0: number, a1: number, s0: number, s1: number, y: number, color: RGB): { left: Vec2[]; right: Vec2[] } {
    const stations: { a: number; l: Vec2; r: Vec2 }[] = [];
    const start = sampleAt(line, a0, s0);
    const startR = sampleAt(line, a0, s1);
    stations.push({ a: a0, l: start.p, r: startR.p });
    for (let i = 0; i < line.pts.length; i++) {
      const ai = line.arc[i]!;
      if (ai > a0 + 1e-6 && ai < a1 - 1e-6) stations.push({ a: ai, l: offsetAt(line, i, s0), r: offsetAt(line, i, s1) });
    }
    stations.push({ a: a1, l: sampleAt(line, a1, s0).p, r: sampleAt(line, a1, s1).p });

    const half = Math.max(Math.abs(s0), Math.abs(s1)) || 1;
    const idx = stations.map((st) => [
      this.vertex(st.l[0], y, st.l[1], 0, 1, 0, color, st.a, s0 / half),
      this.vertex(st.r[0], y, st.r[1], 0, 1, 0, color, st.a, s1 / half),
    ]);
    for (let k = 0; k < stations.length - 1; k++) {
      const [l0, r0] = idx[k]!;
      const [l1, r1] = idx[k + 1]!;
      const A = stations[k]!;
      const B = stations[k + 1]!;
      this.tri2D(l0!, r0!, l1!, A.l[0], A.l[1], A.r[0], A.r[1], B.l[0], B.l[1]);
      this.tri2D(r0!, r1!, l1!, A.r[0], A.r[1], B.r[0], B.r[1], B.l[0], B.l[1]);
    }
    return { left: stations.map((s) => s.l), right: stations.map((s) => s.r) };
  }

  build(): MeshBuffers {
    return {
      positions: new Float32Array(this.p),
      normals: new Float32Array(this.n),
      colors: new Float32Array(this.c),
      uvs: new Float32Array(this.uv),
      indices: new Uint32Array(this.i),
    };
  }
}
