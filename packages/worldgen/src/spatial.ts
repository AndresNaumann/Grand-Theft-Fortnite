/** Uniform grid over axis-aligned boxes, for fast "what's near this point" queries. Deterministic iteration order. */
export class GridIndex<T> {
  private cells = new Map<string, T[]>();
  private readonly cellSize: number;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  insert(item: T, minX: number, minZ: number, maxX: number, maxZ: number): void {
    const s = this.cellSize;
    for (let cx = Math.floor(minX / s); cx <= Math.floor(maxX / s); cx++) {
      for (let cz = Math.floor(minZ / s); cz <= Math.floor(maxZ / s); cz++) {
        const k = this.key(cx, cz);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(item);
      }
    }
  }

  /** Items whose boxes overlap the cells within `radius` of (x, z). May contain duplicates. */
  query(x: number, z: number, radius = 0): T[] {
    const s = this.cellSize;
    const out: T[] = [];
    for (let cx = Math.floor((x - radius) / s); cx <= Math.floor((x + radius) / s); cx++) {
      for (let cz = Math.floor((z - radius) / s); cz <= Math.floor((z + radius) / s); cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (list) for (const item of list) out.push(item);
      }
    }
    return out;
  }
}

/** Squared distance from point to segment. */
export function distToSegment2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx - px;
  const qz = az + t * dz - pz;
  return qx * qx + qz * qz;
}
