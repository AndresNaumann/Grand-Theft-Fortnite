import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { OsmJson } from "../src/parse.ts";
import type { MeshBuffers, Tags, WorldgenConfig } from "../src/types.ts";

/** Real Overpass response for a ~180 m × 200 m patch of Back Bay (Commonwealth Ave Mall at Dartmouth St). */
export function loadFixture(): OsmJson {
  const path = fileURLToPath(new URL("../fixtures/back-bay-mini.osm.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as OsmJson;
}

export const FIXTURE_CONFIG: WorldgenConfig = {
  bbox: [42.3496, -71.0805, 42.3512, -71.078],
  origin: { lat: 42.3504, lon: -71.07925 },
};

/** Small synthetic-OSM builder working in local meters around (0, 0). Origin is lat 0 / lon 0 for simplicity. */
export function synth() {
  const elements: OsmJson["elements"] = [];
  let nextId = 1;
  // At lat 0: 1 m east = 1/111320 deg lon; 1 m south (+z) = -1/110540 deg lat.
  const node = (x: number, z: number, tags?: Tags) => {
    const id = nextId++;
    elements.push({ type: "node", id, lat: -z / 110_540, lon: x / 111_320, ...(tags ? { tags } : {}) });
    return id;
  };
  const way = (nodes: number[], tags: Tags) => {
    const id = nextId++;
    elements.push({ type: "way", id, nodes, tags });
    return id;
  };
  const closedWay = (pts: [number, number][], tags: Tags) => {
    const ids = pts.map(([x, z]) => node(x, z));
    return way([...ids, ids[0]!], tags);
  };
  const config: WorldgenConfig = { bbox: [-0.002, -0.002, 0.002, 0.002], origin: { lat: 0, lon: 0 } };
  return { elements, node, way, closedWay, config, json: (): OsmJson => ({ elements }) };
}

/** FNV-1a over the raw bytes of every buffer, in a fixed order. */
export function hashBuffers(buffers: ArrayBufferView[]): string {
  let h = 0x811c9dc5;
  for (const b of buffers) {
    const bytes = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i]!;
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function triangleNormal(m: MeshBuffers, t: number): [number, number, number] {
  const p = (k: number) => {
    const i = m.indices[t * 3 + k]! * 3;
    return [m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!] as const;
  };
  const [a, b, c] = [p(0), p(1), p(2)];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
}
