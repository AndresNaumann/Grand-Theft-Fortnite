import { describe, expect, it } from "vitest";
import { generateWorld } from "../src/generate.ts";
import { GROUND_LAYERS } from "../src/layers.ts";
import { TREE_STRIDE, type MeshBuffers } from "../src/types.ts";
import { FIXTURE_CONFIG, hashBuffers, loadFixture, synth, triangleNormal } from "./helpers.ts";

const fixture = loadFixture();

function checkMesh(m: MeshBuffers) {
  const vcount = m.positions.length / 3;
  expect(m.normals.length).toBe(m.positions.length);
  expect(m.colors.length).toBe(m.positions.length);
  expect(m.uvs.length).toBe((m.positions.length / 3) * 2);
  for (const i of m.indices) expect(i).toBeLessThan(vcount);
  for (let i = 0; i < m.normals.length; i += 3) {
    expect(Math.hypot(m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!)).toBeCloseTo(1, 5);
  }
  for (const c of m.colors) {
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(1);
  }
}

/** Every triangle's winding must agree with its vertex normals (so front faces are the visible side). */
function checkWindingMatchesNormals(m: MeshBuffers) {
  for (let t = 0; t < m.indices.length / 3; t++) {
    const g = triangleNormal(m, t);
    const len = Math.hypot(...g);
    if (len < 1e-9) continue; // degenerate sliver
    const i = m.indices[t * 3]! * 3;
    const dot = g[0] * m.normals[i]! + g[1] * m.normals[i + 1]! + g[2] * m.normals[i + 2]!;
    expect(dot / len).toBeGreaterThan(0.99);
  }
}

describe("generateWorld on the Back Bay fixture", () => {
  const world = generateWorld(fixture, FIXTURE_CONFIG);

  it("produces buildings, roads, footways, areas and trees", () => {
    expect(world.stats.buildings + world.stats.buildingParts).toBeGreaterThan(10);
    expect(world.layers.buildings.indices.length).toBeGreaterThan(0);
    expect(world.layers.roads.indices.length).toBeGreaterThan(0);
    expect(world.layers.footways.indices.length).toBeGreaterThan(0);
    expect(world.layers.areas.indices.length).toBeGreaterThan(0);
    expect(world.trees.length / TREE_STRIDE).toBeGreaterThan(10);
  });

  it("emits well-formed meshes whose winding matches their normals", () => {
    for (const m of Object.values(world.layers)) {
      checkMesh(m);
      checkWindingMatchesNormals(m);
    }
  });

  it("puts ground layers at their SPEC §6.6 heights", () => {
    for (const name of ["areas", "water", "footways", "roads", "markings"] as const) {
      const { positions } = world.layers[name];
      for (let i = 1; i < positions.length; i += 3) expect(positions[i]).toBeCloseTo(GROUND_LAYERS[name].y, 5);
    }
  });

  it("keeps every tree inside the bbox", () => {
    const { minX, maxX, minZ, maxZ } = world.bounds;
    for (let i = 0; i < world.trees.length; i += TREE_STRIDE) {
      expect(world.trees[i]).toBeGreaterThanOrEqual(minX);
      expect(world.trees[i]).toBeLessThanOrEqual(maxX);
      expect(world.trees[i + 1]).toBeGreaterThanOrEqual(minZ);
      expect(world.trees[i + 1]).toBeLessThanOrEqual(maxZ);
    }
  });

  it("spawns near the origin", () => {
    expect(Math.hypot(world.spawn[0], world.spawn[2])).toBeLessThan(60);
  });

  it("is deterministic: byte-identical buffers across runs (M1 acceptance)", () => {
    const again = generateWorld(loadFixture(), FIXTURE_CONFIG);
    const buffers = (w: typeof world) => [
      ...Object.values(w.layers).map((l) => l.positions),
      w.trees,
      w.furniture.stopSigns,
      w.furniture.trafficLights,
      w.furniture.streetLamps,
    ];
    expect(hashBuffers(buffers(again))).toBe(hashBuffers(buffers(world)));
  });

  it("matches the golden position hash (update deliberately when geometry rules change)", () => {
    const positions = [
      world.layers.areas.positions,
      world.layers.water.positions,
      world.layers.footways.positions,
      world.layers.roads.positions,
      world.layers.markings.positions,
      world.layers.sidewalks.positions,
      world.layers.buildings.positions,
      world.trees,
      world.furniture.stopSigns,
      world.furniture.trafficLights,
      world.furniture.streetLamps,
    ];
    expect(hashBuffers(positions)).toMatchInlineSnapshot(`"0452e03d"`);
  });
});

describe("generateWorld geometry rules (synthetic)", () => {
  it.each([
    ["clockwise", [[-5, -5], [-5, 5], [5, 5], [5, -5]]],
    ["counter-clockwise", [[-5, -5], [5, -5], [5, 5], [-5, 5]]],
  ] as const)("extrudes a %s footprint with outward walls and an upward roof", (_, ring) => {
    const s = synth();
    s.closedWay(ring.map(([x, z]) => [x, z]), { building: "yes", height: "10" });
    const m = generateWorld(s.json(), s.config).layers.buildings;
    checkWindingMatchesNormals(m);
    let walls = 0;
    let roofs = 0;
    for (let t = 0; t < m.indices.length / 3; t++) {
      const g = triangleNormal(m, t);
      const idx = [0, 1, 2].map((k) => m.indices[t * 3 + k]! * 3);
      const cx = idx.reduce((a, i) => a + m.positions[i]!, 0) / 3;
      const cy = idx.reduce((a, i) => a + m.positions[i + 1]!, 0) / 3;
      const cz = idx.reduce((a, i) => a + m.positions[i + 2]!, 0) / 3;
      if (Math.abs(g[1]) > 1e-6) {
        expect(g[1]).toBeGreaterThan(0);
        expect(cy).toBeCloseTo(10, 4);
        roofs++;
      } else {
        expect(g[0] * cx + g[2] * cz).toBeGreaterThan(0); // points away from the center
        walls++;
      }
    }
    expect(walls).toBe(8);
    expect(roofs).toBe(2);
  });

  it("renders building:parts and skips the outline that contains them (SPEC §6.4)", () => {
    const s = synth();
    s.closedWay([[-10, -10], [10, -10], [10, 10], [-10, 10]], { building: "yes" });
    s.closedWay([[-4, -4], [4, -4], [4, 4], [-4, 4]], { "building:part": "yes", height: "40" });
    const w = generateWorld(s.json(), s.config);
    expect(w.stats).toMatchObject({ buildings: 0, buildingParts: 1, outlinesSkippedForParts: 1 });
    const ys = Array.from(w.layers.buildings.positions.filter((_, i) => i % 3 === 1));
    expect(Math.max(...ys)).toBeCloseTo(40);
  });

  it("adds a junction disc where 3+ way ends meet, not where 2 do", () => {
    const VERTS_PER_DISC = 17;
    const three = synth();
    const c = three.node(0, 0);
    for (const [x, z] of [[20, 0], [-20, 0], [0, 20]] as const) three.way([c, three.node(x, z)], { highway: "residential" });
    expect(generateWorld(three.json(), three.config).layers.roads.positions.length / 3).toBe(3 * 4 + VERTS_PER_DISC);

    const tee = synth();
    const mid = tee.node(0, 0);
    tee.way([tee.node(-20, 0), mid, tee.node(20, 0)], { highway: "residential" });
    tee.way([mid, tee.node(0, 20)], { highway: "residential" });
    expect(generateWorld(tee.json(), tee.config).layers.roads.positions.length / 3).toBe(6 + 4 + VERTS_PER_DISC);

    const chain = synth();
    const j = chain.node(0, 0);
    chain.way([chain.node(-20, 0), j], { highway: "residential" });
    chain.way([j, chain.node(20, 0)], { highway: "residential" });
    expect(generateWorld(chain.json(), chain.config).layers.roads.positions.length / 3).toBe(8);
  });

  it("clamps sharp miters to 2× half-width", () => {
    const s = synth();
    s.way([s.node(-30, 0), s.node(0, 0), s.node(-30, 1)], { highway: "residential" }); // ~178° hairpin
    const p = generateWorld(s.json(), s.config).layers.roads.positions;
    for (let i = 0; i < p.length; i += 3) {
      const nearApex = Math.hypot(p[i]!, p[i + 2]!);
      if (nearApex < 10) expect(nearApex).toBeLessThanOrEqual(2 * 3 + 1e-4);
    }
  });

  it("scatters ~1 tree / 80 m² in parks, keeping 2 m clear of roads; mapped trees are kept", () => {
    const s = synth();
    s.closedWay([[-50, -50], [50, -50], [50, 50], [-50, 50]], { leisure: "park" });
    s.way([s.node(-60, 0), s.node(60, 0)], { highway: "footway" }); // 2 m wide
    s.node(0, 1.5, { natural: "tree" }); // street tree right next to the path
    const w = generateWorld(s.json(), s.config);
    const n = w.trees.length / TREE_STRIDE;
    expect(n).toBeGreaterThan(80);
    expect(n).toBeLessThan(130);
    let mappedFound = false;
    for (let i = 0; i < w.trees.length; i += TREE_STRIDE) {
      const x = w.trees[i]!;
      const z = w.trees[i + 1]!;
      if (Math.abs(x) < 0.01 && Math.abs(z - 1.5) < 0.01) mappedFound = true;
      else expect(Math.abs(z)).toBeGreaterThanOrEqual(1 + 2 - 1e-6);
    }
    expect(mappedFound).toBe(true);
  });

  it("spawns on the closest walkable way to the origin", () => {
    const s = synth();
    s.way([s.node(-50, 30), s.node(50, 30)], { highway: "footway" });
    s.way([s.node(-50, 8), s.node(50, 8)], { highway: "residential" });
    const w = generateWorld(s.json(), s.config);
    expect(w.spawn[0]).toBeCloseTo(0, 3);
    expect(w.spawn[2]).toBeCloseTo(8, 3);
  });
});
