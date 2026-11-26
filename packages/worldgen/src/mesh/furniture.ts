import { hexToLinear } from "../color.ts";
import { PALETTE } from "../palette.ts";
import type { StreetNodeKind } from "../parse.ts";
import { onewayDirection, roadRank } from "../resolve/markings.ts";
import { abbreviateStreetName } from "../resolve/streetName.ts";
import { rngFor } from "../rng.ts";
import { distToSegment2, GridIndex } from "../spatial.ts";
import { TREE_STRIDE, type NameSign, type StreetFurniture, type Tags, type Vec2 } from "../types.ts";
import type { MeshBuilder } from "./builder.ts";
import { arcLengths, prepareLine, rightOf, sampleAt } from "./polyline.ts";
import type { JunctionInfo } from "./roads.ts";

export interface DrivableWay {
  id: string;
  tags: Tags;
  pts: Vec2[];
  nodeIds: number[];
  halfWidth: number;
}

export interface StreetNodeInput {
  id: string;
  nodeId: number;
  kind: StreetNodeKind;
  tags: Tags;
  x: number;
  z: number;
}

export interface FurnitureInput {
  streetNodes: readonly StreetNodeInput[];
  roads: readonly DrivableWay[];
  junctions: ReadonlyMap<number, JunctionInfo>;
  /** Sidewalk centerlines, for generated street lamps. */
  sidewalks: readonly Vec2[][];
  trees: Float32Array;
  /** Where marked crosswalks cross each road (arc length from the way start), keyed by road id. */
  crossingArcs: ReadonlyMap<string, readonly number[]>;
  inBuilding(x: number, z: number): boolean;
}

/** Traffic arriving at a node along one way. */
interface Approach {
  way: DrivableWay;
  /** Index of the node in the way. */
  k: number;
  /** True when travelling in the way's node order. */
  forward: boolean;
  /** Unit travel direction arriving at the node. */
  t: Vec2;
  x: number;
  z: number;
}

const LOOK_DISTANCE = 5; // m used to measure a way's direction near a node
const SIGN_CURB_OFFSET = 0.8; // m beyond the road edge
const STOP_SETBACK = 2.5; // m beyond the junction radius when there's no crosswalk
const BEHIND_CROSSWALK = 1.5 + 0.9; // zebra half-width + gap
const CROSSWALK_SEARCH = 15; // m beyond the junction radius
const SIGNAL_SETBACK = 1; // m beyond the junction radius (at the corner)
const STOP_BAR_DEPTH = 0.45;
const LAMP_SPACING = 30;
const LAMP_MIN_GAP = 18;
const NAME_SIGN_DEDUPE = 60;

/** Unit direction from node k of a way, walking `step` (+1/-1) until LOOK_DISTANCE is covered. */
function directionFrom(w: DrivableWay, k: number, step: 1 | -1): Vec2 | null {
  const [px, pz] = w.pts[k]!;
  let j = k + step;
  let best: Vec2 | null = null;
  while (j >= 0 && j < w.pts.length) {
    const [qx, qz] = w.pts[j]!;
    const d = Math.hypot(qx - px, qz - pz);
    if (d > 1e-3) best = [(qx - px) / d, (qz - pz) / d];
    if (d >= LOOK_DISTANCE) break;
    j += step;
  }
  return best;
}

const facing = (t: Vec2) => Math.atan2(-t[0], -t[1]); // rotY so local +z faces against travel

export function planStreetFurniture(input: FurnitureInput, markings: MeshBuilder, markingsY: number): StreetFurniture {
  const { roads, junctions } = input;

  // node id -> (way, index) for every drivable way.
  const nodeWays = new Map<number, { w: DrivableWay; k: number }[]>();
  for (const w of roads) {
    w.nodeIds.forEach((id, k) => {
      let list = nodeWays.get(id);
      if (!list) nodeWays.set(id, (list = []));
      list.push({ w, k });
    });
  }

  const segGrid = new GridIndex<{ ax: number; az: number; bx: number; bz: number; hw: number }>(16);
  for (const w of roads) {
    for (let i = 0; i < w.pts.length - 1; i++) {
      const [ax, az] = w.pts[i]!;
      const [bx, bz] = w.pts[i + 1]!;
      const e = w.halfWidth;
      segGrid.insert({ ax, az, bx, bz, hw: e }, Math.min(ax, bx) - e, Math.min(az, bz) - e, Math.max(ax, bx) + e, Math.max(az, bz) + e);
    }
  }
  /** Nearest drivable road point within `radius`, with that road's half-width. */
  const nearestRoad = (x: number, z: number, radius: number) => {
    let best: { d: number; px: number; pz: number; hw: number } | null = null;
    for (const s of segGrid.query(x, z, radius)) {
      const d2 = distToSegment2(x, z, s.ax, s.az, s.bx, s.bz);
      if (d2 > radius * radius || (best && d2 >= best.d * best.d)) continue;
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const len2 = dx * dx + dz * dz;
      const u = len2 > 0 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2)) : 0;
      best = { d: Math.sqrt(d2), px: s.ax + u * dx, pz: s.az + u * dz, hw: s.hw };
    }
    return best;
  };
  const onRoad = (x: number, z: number, margin = 0.3) => {
    const r = nearestRoad(x, z, 12);
    return r !== null && r.d < r.hw + margin;
  };

  const approachesAt = (nodeId: number): Approach[] => {
    const out: Approach[] = [];
    for (const { w, k } of nodeWays.get(nodeId) ?? []) {
      const dir = onewayDirection(w.tags);
      const [x, z] = w.pts[k]!;
      if (k > 0 && dir >= 0) {
        const back = directionFrom(w, k, -1);
        if (back) out.push({ way: w, k, forward: true, t: [-back[0], -back[1]], x, z });
      }
      if (k < w.pts.length - 1 && dir <= 0) {
        const ahead = directionFrom(w, k, 1);
        if (ahead) out.push({ way: w, k, forward: false, t: [-ahead[0], -ahead[1]], x, z });
      }
    }
    return out;
  };

  /** Distance along the way from node k to the next junction in the travel direction. */
  const distanceToJunction = (a: Approach): number => {
    const step = a.forward ? 1 : -1;
    let d = 0;
    for (let j = a.k; j + step >= 0 && j + step < a.way.pts.length; j += step) {
      const p = a.way.pts[j]!;
      const q = a.way.pts[j + step]!;
      d += Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (junctions.has(a.way.nodeIds[j + step]!)) return d;
    }
    return Infinity;
  };

  /** Where traffic on this approach should stop: just behind the last crosswalk before the junction. */
  const arcCache = new Map<DrivableWay, number[]>();
  const stopDistance = (a: Approach, j: JunctionInfo): number => {
    let arc = arcCache.get(a.way);
    if (!arc) arcCache.set(a.way, (arc = arcLengths(a.way.pts)));
    const at = arc[a.k]!;
    let best = j.radius + STOP_SETBACK;
    for (const c of input.crossingArcs.get(a.way.id) ?? []) {
      const d = a.forward ? at - c : c - at;
      if (d > 0 && d <= j.radius + CROSSWALK_SEARCH) best = Math.max(best, d + BEHIND_CROSSWALK);
    }
    return best;
  };

  const white = hexToLinear(PALETTE.roadMarking);
  const stopBar = (a: Approach, along: number) => {
    const hw = a.way.halfWidth;
    const twoWay = onewayDirection(a.way.tags) === 0;
    const r = rightOf(a.t[0], a.t[1]);
    const cx = a.x - a.t[0] * along;
    const cz = a.z - a.t[1] * along;
    const s0 = twoWay ? 0.2 : -hw + 0.2;
    const s1 = hw - 0.2;
    const h = STOP_BAR_DEPTH / 2;
    const P = (s: number, f: number): Vec2 => [cx + r[0] * s + a.t[0] * f, cz + r[1] * s + a.t[1] * f];
    markings.flatQuad(P(s0, -h), P(s1, -h), P(s1, h), P(s0, h), markingsY, white);
  };

  const placed = { stop: [] as number[], yield: [] as number[], lights: [] as number[] };
  const tooClose = (arr: number[], x: number, z: number, r: number) => {
    for (let i = 0; i < arr.length; i += 3) if ((arr[i]! - x) ** 2 + (arr[i + 1]! - z) ** 2 < r * r) return true;
    return false;
  };

  // ── Stop and yield signs, traffic lights ─────────────────────────────────────────────
  for (const n of input.streetNodes) {
    if (n.kind === "street_lamp") continue;
    const j = junctions.get(n.nodeId);
    let apps = approachesAt(n.nodeId);
    if (apps.length === 0) continue;

    const dirTag = n.tags["direction"];
    if (dirTag === "forward") apps = apps.filter((a) => a.forward);
    else if (dirTag === "backward") apps = apps.filter((a) => !a.forward);
    else if (n.kind !== "traffic_signals" && n.tags["stop"] !== "all" && dirTag !== "both") {
      if (j) {
        // Ambiguous stop at a junction: it controls the minor road(s).
        const minRank = Math.min(...apps.map((a) => roadRank(a.way.tags)));
        apps = apps.filter((a) => roadRank(a.way.tags) === minRank);
      } else {
        // Mid-way node: it controls traffic heading to the nearer junction.
        const dist = apps.map(distanceToJunction);
        const best = Math.min(...dist);
        apps = apps.filter((_, i) => dist[i] === best).slice(0, 1);
      }
    }

    for (const a of apps) {
      const hw = a.way.halfWidth;
      const r = rightOf(a.t[0], a.t[1]);
      if (n.kind === "traffic_signals") {
        const along = j ? j.radius + SIGNAL_SETBACK : 0;
        const x = a.x - a.t[0] * along + r[0] * (hw + SIGN_CURB_OFFSET);
        const z = a.z - a.t[1] * along + r[1] * (hw + SIGN_CURB_OFFSET);
        if (j) stopBar(a, stopDistance(a, j));
        if (tooClose(placed.lights, x, z, 6) || input.inBuilding(x, z)) continue;
        placed.lights.push(x, z, facing(a.t));
      } else {
        const along = j ? stopDistance(a, j) : 0;
        const x = a.x - a.t[0] * along + r[0] * (hw + SIGN_CURB_OFFSET);
        const z = a.z - a.t[1] * along + r[1] * (hw + SIGN_CURB_OFFSET);
        const list = n.kind === "stop" ? placed.stop : placed.yield;
        if (tooClose(list, x, z, 3) || input.inBuilding(x, z)) continue;
        if (n.kind === "stop") stopBar(a, along);
        list.push(x, z, facing(a.t));
      }
    }
  }

  // ── Street-name signs at junctions of differently named roads ────────────────────────
  const nameSigns: NameSign[] = [];
  for (const [nodeId, j] of junctions) {
    const byName = new Map<string, { rank: number; hw: number; dirs: Vec2[] }>();
    for (const { w, k } of nodeWays.get(nodeId) ?? []) {
      const name = w.tags["name"];
      if (!name) continue;
      const e = byName.get(name) ?? { rank: roadRank(w.tags), hw: w.halfWidth, dirs: [] };
      if (k < w.pts.length - 1) {
        const d = directionFrom(w, k, 1);
        if (d) e.dirs.push(d);
      }
      if (k > 0) {
        const d = directionFrom(w, k, -1);
        if (d) e.dirs.push(d);
      }
      e.rank = Math.max(e.rank, roadRank(w.tags));
      e.hw = Math.max(e.hw, w.halfWidth);
      byName.set(name, e);
    }
    if (byName.size < 2) continue;
    const [A, B] = [...byName.entries()].sort((p, q) => q[1].rank - p[1].rank || (p[0] < q[0] ? -1 : 1));
    if (!A || !B) continue;
    const textA = abbreviateStreetName(A[0]);
    const textB = abbreviateStreetName(B[0]);
    const key = [textA, textB].sort().join("|");
    if (nameSigns.some((s) => s.key === key && (s.x - j.x) ** 2 + (s.z - j.z) ** 2 < NAME_SIGN_DEDUPE ** 2)) continue;

    const combos: { a: Vec2; b: Vec2; theta: number }[] = [];
    for (const a of A[1].dirs) {
      for (const b of B[1].dirs) {
        const theta = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
        if (theta > (20 * Math.PI) / 180 && theta < (160 * Math.PI) / 180) combos.push({ a, b, theta });
      }
    }
    combos.sort((p, q) => Math.abs(p.theta - Math.PI / 2) - Math.abs(q.theta - Math.PI / 2));
    for (const c of combos) {
      const bx = c.a[0] + c.b[0];
      const bz = c.a[1] + c.b[1];
      const bl = Math.hypot(bx, bz);
      const dist = (Math.max(A[1].hw, B[1].hw) + 1.5) / Math.sin(c.theta / 2);
      const x = j.x + (bx / bl) * dist;
      const z = j.z + (bz / bl) * dist;
      if (input.inBuilding(x, z) || onRoad(x, z)) continue;
      nameSigns.push({
        key,
        x,
        z,
        blades: [
          { text: textA, rotY: Math.atan2(-c.a[1], c.a[0]) },
          { text: textB, rotY: Math.atan2(-c.b[1], c.b[0]) },
        ],
      });
      break;
    }
  }

  // ── Street lamps: mapped nodes, then fill along sidewalks ────────────────────────────
  const lamps: number[] = [];
  const lampGrid = new GridIndex<Vec2>(LAMP_MIN_GAP);
  const lampNear = (x: number, z: number) =>
    lampGrid.query(x, z, LAMP_MIN_GAP).some(([lx, lz]) => (lx - x) ** 2 + (lz - z) ** 2 < LAMP_MIN_GAP ** 2);
  const addLamp = (x: number, z: number, rot: number) => {
    lamps.push(x, z, rot);
    lampGrid.insert([x, z], x, z, x, z);
  };
  const treeGrid = new GridIndex<Vec2>(4);
  for (let i = 0; i < input.trees.length; i += TREE_STRIDE) {
    const x = input.trees[i]!;
    const z = input.trees[i + 1]!;
    treeGrid.insert([x, z], x, z, x, z);
  }
  const treeNear = (x: number, z: number) => treeGrid.query(x, z, 1.5).some(([tx, tz]) => (tx - x) ** 2 + (tz - z) ** 2 < 2.25);

  for (const n of input.streetNodes) {
    if (n.kind !== "street_lamp") continue;
    if (input.inBuilding(n.x, n.z) || onRoad(n.x, n.z, 0)) continue;
    addLamp(n.x, n.z, rngFor(n.id, "lamp").range(0, Math.PI * 2));
  }
  for (const pts of input.sidewalks) {
    const line = prepareLine(pts);
    if (!line) continue;
    for (let t = LAMP_SPACING / 2; t < line.length; t += LAMP_SPACING) {
      const p = sampleAt(line, t, 0).p;
      const road = nearestRoad(p[0], p[1], 12);
      if (!road) continue;
      const dx = road.px - p[0];
      const dz = road.pz - p[1];
      const dl = Math.hypot(dx, dz) || 1;
      const x = p[0] + (dx / dl) * 0.65; // toward the curb
      const z = p[1] + (dz / dl) * 0.65;
      if (lampNear(x, z) || treeNear(x, z) || input.inBuilding(x, z) || onRoad(x, z, 0)) continue;
      addLamp(x, z, Math.atan2(dx, dz)); // faces the road
    }
  }

  return {
    stopSigns: new Float32Array(placed.stop),
    yieldSigns: new Float32Array(placed.yield),
    trafficLights: new Float32Array(placed.lights),
    streetLamps: new Float32Array(lamps),
    nameSigns,
  };
}
