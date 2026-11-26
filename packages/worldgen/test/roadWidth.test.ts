import { describe, expect, it } from "vitest";
import { parseOsm } from "../src/parse.ts";
import { resolveRoad } from "../src/resolve/roadWidth.ts";
import { loadFixture } from "./helpers.ts";

describe("resolveRoad (SPEC §6.5)", () => {
  it.each([
    ["motorway", 14, true],
    ["trunk", 12, true],
    ["primary", 10, true],
    ["secondary", 9, true],
    ["tertiary", 8, true],
    ["residential", 6, true],
    ["unclassified", 6, true],
    ["living_street", 6, true],
    ["service", 4, true],
    ["pedestrian", 5, false],
    ["footway", 2, false],
    ["path", 2, false],
    ["cycleway", 2, false],
    ["steps", 2, false],
  ])("highway=%s -> %d m, drivable=%s", (highway, width, drivable) => {
    expect(resolveRoad({ highway })).toEqual({ width, drivable });
  });

  it("lanes × 3.5 overrides the table", () => {
    expect(resolveRoad({ highway: "primary", lanes: "4" })).toEqual({ width: 14, drivable: true });
    expect(resolveRoad({ highway: "residential", lanes: "1" })).toEqual({ width: 3.5, drivable: true });
  });

  it("ignores invalid lanes", () => {
    expect(resolveRoad({ highway: "primary", lanes: "0" })?.width).toBe(10);
    expect(resolveRoad({ highway: "primary", lanes: "many" })?.width).toBe(10);
  });

  it("*_link uses the parent class", () => {
    expect(resolveRoad({ highway: "motorway_link" })).toEqual({ width: 14, drivable: true });
  });

  it("skips non-roads, areas and tunnels", () => {
    expect(resolveRoad({})).toBeNull();
    expect(resolveRoad({ highway: "bus_stop" })).toBeNull();
    expect(resolveRoad({ highway: "construction" })).toBeNull();
    expect(resolveRoad({ highway: "pedestrian", area: "yes" })).toBeNull();
    expect(resolveRoad({ highway: "primary", tunnel: "yes" })).toBeNull();
    expect(resolveRoad({ highway: "footway", tunnel: "building_passage" })).toBeNull();
  });

  it("finds drivable roads and footways in the fixture", () => {
    const resolved = parseOsm(loadFixture()).highways.map((h) => resolveRoad(h.tags));
    expect(resolved.filter((r) => r?.drivable).length).toBeGreaterThan(3);
    expect(resolved.filter((r) => r && !r.drivable).length).toBeGreaterThan(3);
  });
});
