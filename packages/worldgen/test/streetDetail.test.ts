import { describe, expect, it } from "vitest";
import { generateWorld } from "../src/generate.ts";
import { GROUND_LAYERS, SIDEWALK_HEIGHT } from "../src/layers.ts";
import { rightOf } from "../src/mesh/polyline.ts";
import { PALETTE } from "../src/palette.ts";
import { hexToLinear } from "../src/color.ts";
import { bikeLaneSides, onewayDirection, planMarkings } from "../src/resolve/markings.ts";
import { resolveRoad } from "../src/resolve/roadWidth.ts";
import { abbreviateStreetName } from "../src/resolve/streetName.ts";
import { PROP_STRIDE, type MeshBuffers } from "../src/types.ts";
import { FIXTURE_CONFIG, loadFixture, synth } from "./helpers.ts";

/** Vertices of a mesh whose color matches a palette hex. */
function verticesOfColor(m: MeshBuffers, hex: string): [number, number, number][] {
  const [r, g, b] = hexToLinear(hex);
  const out: [number, number, number][] = [];
  for (let i = 0; i < m.colors.length; i += 3) {
    if (Math.abs(m.colors[i]! - r) < 1e-4 && Math.abs(m.colors[i + 1]! - g) < 1e-4 && Math.abs(m.colors[i + 2]! - b) < 1e-4) {
      out.push([m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!]);
    }
  }
  return out;
}

const props = (a: Float32Array) => Array.from({ length: a.length / PROP_STRIDE }, (_, i) => ({ x: a[i * 3]!, z: a[i * 3 + 1]!, rot: a[i * 3 + 2]! }));

describe("conventions", () => {
  it("right of an eastbound way is south (+z)", () => {
    const [ex, ez] = rightOf(1, 0);
    expect(ex).toBeCloseTo(0, 9);
    expect(ez).toBeCloseTo(1, 9);
    const [nx, nz] = rightOf(0, -1); // northbound -> east
    expect(nx).toBeCloseTo(1, 9);
    expect(nz).toBeCloseTo(0, 9);
  });

  it("abbreviates street-name suffixes only at the end", () => {
    expect(abbreviateStreetName("Boylston Street")).toBe("Boylston St");
    expect(abbreviateStreetName("Massachusetts Avenue")).toBe("Massachusetts Ave");
    expect(abbreviateStreetName("Street Lane")).toBe("Street Ln");
    expect(abbreviateStreetName("  Copley   Square ")).toBe("Copley Sq");
    expect(abbreviateStreetName("Commonwealth Mall")).toBe("Commonwealth Mall");
  });

  it("reads one-way and bike-lane tags", () => {
    expect(onewayDirection({ oneway: "yes" })).toBe(1);
    expect(onewayDirection({ oneway: "-1" })).toBe(-1);
    expect(onewayDirection({ junction: "roundabout" })).toBe(1);
    expect(onewayDirection({})).toBe(0);
    expect(bikeLaneSides({ "cycleway:right": "lane" })).toEqual({ left: false, right: true });
    expect(bikeLaneSides({ "cycleway:both": "track" })).toEqual({ left: true, right: true });
    expect(bikeLaneSides({ cycleway: "lane", oneway: "-1" })).toEqual({ left: true, right: false });
    expect(bikeLaneSides({ "cycleway:left": "shared_lane" })).toEqual({ left: false, right: false });
  });

  it("widens roads by 1.5 m per painted bike lane", () => {
    expect(resolveRoad({ highway: "secondary", lanes: "2", "cycleway:right": "lane" })?.width).toBe(8.5);
    expect(resolveRoad({ highway: "residential", "cycleway:both": "lane" })?.width).toBe(9);
    expect(resolveRoad({ highway: "footway", "cycleway:right": "lane" })?.width).toBe(2);
  });
});

describe("planMarkings", () => {
  it("two-way secondary: double yellow on the centerline", () => {
    const s = planMarkings({ highway: "secondary", lanes: "2" }, 7);
    expect(s.filter((x) => x.color === "yellow").map((x) => x.offset)).toEqual([-0.1, 0.1]);
    expect(s.every((x) => !x.dashed)).toBe(true);
  });

  it("two-way residential: dashed yellow center", () => {
    expect(planMarkings({ highway: "residential" }, 6)).toEqual([{ offset: 0, width: 0.12, color: "yellow", dashed: true }]);
  });

  it("one-way, 3 lanes: two dashed white lines, no yellow", () => {
    const s = planMarkings({ highway: "primary", oneway: "yes", lanes: "3" }, 10.5);
    expect(s.map((x) => [x.color, x.dashed])).toEqual([["white", true], ["white", true]]);
    expect(s[0]!.offset).toBeCloseTo(-5.25 + 3.5);
    expect(s[1]!.offset).toBeCloseTo(-5.25 + 7);
  });

  it("asymmetric lanes:forward/backward move the center line", () => {
    const s = planMarkings({ highway: "primary", lanes: "3", "lanes:forward": "2" }, 10.5);
    const yellow = s.filter((x) => x.color === "yellow");
    expect((yellow[0]!.offset + yellow[1]!.offset) / 2).toBeCloseTo(-5.25 + 3.5); // 1 backward lane on the left
  });

  it("paints a bike lane on the right edge with a separating line", () => {
    const s = planMarkings({ highway: "secondary", oneway: "yes", lanes: "2", "cycleway:right": "lane" }, 8.5);
    const bike = s.find((x) => x.color === "bike")!;
    expect(bike.offset).toBeCloseTo(4.25 - 0.75);
    expect(s.some((x) => x.color === "white" && !x.dashed && Math.abs(x.offset - (4.25 - 1.5)) < 1e-9)).toBe(true);
  });

  it("leaves service roads and living streets unmarked", () => {
    expect(planMarkings({ highway: "service" }, 4)).toEqual([]);
    expect(planMarkings({ highway: "living_street" }, 6)).toEqual([]);
  });
});

describe("street detail geometry (synthetic)", () => {
  /** A + intersection: eastbound-defined Main Street (secondary) crossed by Side Street (residential). */
  function crossroads(extra?: (s: ReturnType<typeof synth>, c: number) => void) {
    const s = synth();
    const c = s.node(0, 0);
    s.way([s.node(-60, 0), c, s.node(60, 0)], { highway: "secondary", lanes: "2", name: "Main Street", "cycleway:right": "lane" });
    s.way([s.node(0, -60), c, s.node(0, 60)], { highway: "residential", name: "Side Street" });
    extra?.(s, c);
    return { s, c, world: () => generateWorld(s.json(), s.config) };
  }

  it("puts the right-side bike lane south of an eastbound-defined road", () => {
    const { world } = crossroads();
    const bike = verticesOfColor(world().layers.markings, PALETTE.bikeLane).filter(([x]) => Math.abs(x) > 15);
    expect(bike.length).toBeGreaterThan(0);
    for (const [, , z] of bike) expect(z).toBeGreaterThan(0);
  });

  it("keeps lane lines out of the intersection", () => {
    const w = world0();
    const m = w.layers.markings;
    const radius = 4.25; // widest half-width at the junction (8.5 m / 2)
    for (let i = 0; i < m.positions.length; i += 3) {
      expect(Math.hypot(m.positions[i]!, m.positions[i + 2]!)).toBeGreaterThan(radius + 1.5 - 0.2);
    }
    function world0() {
      return crossroads().world();
    }
  });

  it("all markings sit on the markings layer", () => {
    const m = crossroads().world().layers.markings;
    for (let i = 1; i < m.positions.length; i += 3) expect(m.positions[i]).toBeCloseTo(GROUND_LAYERS.markings.y, 5);
  });

  it("places a stop sign for the minor road, on its right, facing oncoming traffic, with a stop bar", () => {
    const { world } = crossroads((s, c) => {
      const el = s.elements.find((e) => e.type === "node" && e.id === c)!;
      (el as { tags?: Record<string, string> }).tags = { highway: "stop" };
    });
    const w = world();
    const signs = props(w.furniture.stopSigns);
    // Side Street has approaches from the north (travel +z) and south (travel -z); Main Street has none.
    expect(signs).toHaveLength(2);
    const north = signs.find((p) => p.z < 0)!;
    expect(north.x).toBeCloseTo(-(3 + 0.8), 3); // right of southbound travel is west
    expect(north.z).toBeCloseTo(-(4.25 + 2.5), 3); // no crosswalk: 2.5 m beyond the junction radius
    expect(Math.sin(north.rot)).toBeCloseTo(0, 5); // faces north (-z), toward oncoming traffic
    expect(Math.cos(north.rot)).toBeCloseTo(-1, 5);
    const white = verticesOfColor(w.layers.markings, PALETTE.roadMarking);
    expect(white.some(([x, , z]) => x < 0 && Math.abs(z + 6.75) < 0.3)).toBe(true);
  });

  it("puts a traffic light on every legal approach, respecting one-ways", () => {
    const twoWay = crossroads((s, c) => {
      const el = s.elements.find((e) => e.type === "node" && e.id === c)!;
      (el as { tags?: Record<string, string> }).tags = { highway: "traffic_signals" };
    });
    expect(twoWay.world().furniture.trafficLights.length / PROP_STRIDE).toBe(4);

    const s = synth();
    const c = s.node(0, 0, { highway: "traffic_signals" });
    s.way([s.node(-60, 0), c, s.node(60, 0)], { highway: "secondary", oneway: "yes" });
    s.way([s.node(0, -60), c, s.node(0, 60)], { highway: "residential" });
    expect(generateWorld(s.json(), s.config).furniture.trafficLights.length / PROP_STRIDE).toBe(3);
  });

  it("puts one street-name sign on a corner, off the road", () => {
    const w = crossroads().world();
    expect(w.furniture.nameSigns).toHaveLength(1);
    const sign = w.furniture.nameSigns[0]!;
    expect(sign.blades.map((b) => b.text).sort()).toEqual(["Main St", "Side St"]);
    expect(Math.abs(sign.x)).toBeGreaterThan(3); // clear of Side Street (3 m half-width)
    expect(Math.abs(sign.z)).toBeGreaterThan(4.25); // clear of Main Street
  });

  it("raises sidewalks with curbs and spaces generated lamps along them", () => {
    const { world } = crossroads((s) => {
      s.way([s.node(-50, 9), s.node(50, 9)], { highway: "footway", footway: "sidewalk" });
      s.node(-48, 8.4, { highway: "street_lamp" }); // mapped lamp near the start
    });
    const w = world();
    const ys = new Set(Array.from(w.layers.sidewalks.positions.filter((_, i) => i % 3 === 1)).map((y) => +y.toFixed(3)));
    expect([...ys].sort()).toEqual([0, SIDEWALK_HEIGHT]);
    const lamps = props(w.furniture.streetLamps);
    expect(lamps.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < lamps.length; i++) {
      for (let j = i + 1; j < lamps.length; j++) {
        expect(Math.hypot(lamps[i]!.x - lamps[j]!.x, lamps[i]!.z - lamps[j]!.z)).toBeGreaterThanOrEqual(18);
      }
    }
    // Generated lamps sit toward the curb (road side, z < 9), never on the road.
    for (const l of lamps.filter((l) => l.x > 10)) expect(l.z).toBeLessThan(9);
    for (const l of lamps) expect(Math.abs(l.z) > 4.25 && (Math.abs(l.x) > 3 || Math.abs(l.z) > 4.25)).toBe(true);
  });

  it("draws zebra bars only where a marked crossing is over the road", () => {
    const s = synth();
    s.way([s.node(-60, 0), s.node(60, 0)], { highway: "secondary", lanes: "2" }); // 7 m wide
    s.way([s.node(20, -12), s.node(20, 12)], { highway: "footway", footway: "crossing", crossing: "marked" });
    s.way([s.node(-20, -12), s.node(-20, 12)], { highway: "footway", footway: "crossing", crossing: "unmarked" });
    const w = generateWorld(s.json(), s.config);
    expect(w.stats.crosswalkBars).toBeGreaterThanOrEqual(6);
    expect(w.stats.crosswalkBars).toBeLessThanOrEqual(8);
    const bars = verticesOfColor(w.layers.markings, PALETTE.roadMarking).filter(([x]) => Math.abs(x - 20) < 2);
    for (const [, , z] of bars) expect(Math.abs(z)).toBeLessThan(3.5 + 0.6);
  });
});

describe("crosswalks vs. lines and stop bars", () => {
  it("breaks lane lines around a crosswalk and puts the stop bar behind it", () => {
    const s = synth();
    const c = s.node(0, 0, { highway: "traffic_signals" });
    s.way([s.node(-80, 0), c, s.node(80, 0)], { highway: "tertiary", lanes: "2" }); // 7 m wide, double yellow
    s.way([s.node(0, -80), c, s.node(0, 80)], { highway: "tertiary", lanes: "2" });
    s.way([s.node(-10, -6), s.node(-10, 6)], { highway: "footway", footway: "crossing", crossing: "marked" });
    const w = generateWorld(s.json(), s.config);
    const yellow = verticesOfColor(w.layers.markings, PALETTE.markingYellow);
    // No yellow paint within the crosswalk clearance around x = -10 on the east-west road.
    for (const [x, , z] of yellow) if (Math.abs(z) < 1) expect(Math.abs(x + 10)).toBeGreaterThanOrEqual(2 - 1e-3);
    // Eastbound stop bar (south half of the road) sits behind the crosswalk at x = -10 - 2.4.
    const white = verticesOfColor(w.layers.markings, PALETTE.roadMarking);
    expect(white.some(([x, , z]) => z > 0.1 && z < 3.5 && Math.abs(x + 12.4) < 0.3)).toBe(true);
  });
});

describe("street detail on the Back Bay fixture", () => {
  const w = generateWorld(loadFixture(), FIXTURE_CONFIG);
  it("finds the mapped signals, lamps, names and markings", () => {
    expect(w.stats.trafficLights).toBeGreaterThanOrEqual(3);
    expect(w.stats.streetLamps).toBeGreaterThanOrEqual(20);
    expect(w.stats.nameSigns).toBeGreaterThanOrEqual(1);
    expect(w.stats.stripes).toBeGreaterThan(0);
    expect(w.stats.sidewalks).toBeGreaterThan(0);
    expect(w.furniture.nameSigns.flatMap((s) => s.blades.map((b) => b.text))).toContain("Newbury St");
  });
});
