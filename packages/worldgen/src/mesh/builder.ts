import type { RGB } from "../color.ts";
import type { MeshBuffers, Polygon } from "../types.ts";
import { triangulate } from "./polygon.ts";

/** Accumulates one merged, indexed, vertex-colored mesh. */
export class MeshBuilder {
  private p: number[] = [];
  private n: number[] = [];
  private c: number[] = [];
  private i: number[] = [];

  get vertexCount(): number {
    return this.p.length / 3;
  }

  get triangleCount(): number {
    return this.i.length / 3;
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, color: RGB): number {
    this.p.push(x, y, z);
    this.n.push(nx, ny, nz);
    this.c.push(color[0], color[1], color[2]);
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

  /**
   * Add a horizontal triangle at height y, wound so its face normal points up (faceUp) or down.
   * In (x, z), a triangle faces up when it is clockwise (negative 2D cross product).
   */
  flatTri(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, y: number, color: RGB, faceUp = true): void {
    const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    const ny = faceUp ? 1 : -1;
    const a = this.vertex(ax, y, az, 0, ny, 0, color);
    const b = this.vertex(bx, y, bz, 0, ny, 0, color);
    const c = this.vertex(cx, y, cz, 0, ny, 0, color);
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
      const ax = coords[ia * 2]!;
      const az = coords[ia * 2 + 1]!;
      const cross =
        (coords[ib * 2]! - ax) * (coords[ic * 2 + 1]! - az) - (coords[ib * 2 + 1]! - az) * (coords[ic * 2]! - ax);
      if (cross < 0 === faceUp) this.tri(base + ia, base + ib, base + ic);
      else this.tri(base + ia, base + ic, base + ib);
    }
  }

  build(): MeshBuffers {
    return {
      positions: new Float32Array(this.p),
      normals: new Float32Array(this.n),
      colors: new Float32Array(this.c),
      indices: new Uint32Array(this.i),
    };
  }
}
