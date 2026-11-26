import { describe, expect, it } from "vitest";
import { parseLength, resolveHeight } from "../src/resolve/height.ts";
import { parseOsm } from "../src/parse.ts";
import { loadFixture } from "./helpers.ts";

describe("parseLength", () => {
  it.each([
    ["12", 12],
    ["12.5 m", 12.5],
    ["12m", 12],
    ["3;4", 3],
    ["40'", 40 * 0.3048],
    ["40 ft", 40 * 0.3048],
    ["7,5", 7.5],
  ])("%s -> %d", (raw, expected) => expect(parseLength(raw)).toBeCloseTo(expected, 6));

  it.each([undefined, "", "tall", "-3"])("%s -> undefined", (raw) => expect(parseLength(raw)).toBeUndefined());
});

describe("resolveHeight (SPEC §6.4)", () => {
  it("step 2: height tag wins over everything else", () => {
    const h = resolveHeight("way/1", { building: "house", height: "22", "building:levels": "2" });
    expect(h).toEqual({ base: 0, top: 22, source: "height" });
  });

  it("step 3: levels × 3.2 plus roof levels", () => {
    expect(resolveHeight("way/1", { building: "yes", "building:levels": "4" }).top).toBeCloseTo(12.8);
    expect(resolveHeight("way/1", { building: "yes", "building:levels": "4", "roof:levels": "1" }).top).toBeCloseTo(16);
  });

  it.each([
    ["house", 7],
    ["detached", 7],
    ["semidetached_house", 7],
    ["apartments", 15],
    ["residential", 15],
    ["commercial", 14],
    ["retail", 14],
    ["office", 14],
    ["garage", 3],
    ["garages", 3],
    ["shed", 3],
    ["hut", 3],
    ["church", 18],
  ])("step 4: building=%s -> %d m", (type, m) => {
    expect(resolveHeight("way/1", { building: type })).toMatchObject({ top: m, source: "type" });
  });

  it("step 5: building=yes uses a seeded random height in [6, 14], stable per id", () => {
    const a = resolveHeight("way/42", { building: "yes" });
    expect(a.source).toBe("random");
    expect(a.top).toBeGreaterThanOrEqual(6);
    expect(a.top).toBeLessThan(14);
    expect(resolveHeight("way/42", { building: "yes" }).top).toBe(a.top);
    expect(resolveHeight("way/43", { building: "yes" }).top).not.toBe(a.top);
  });

  it("clamps to [2.5, 300]", () => {
    expect(resolveHeight("way/1", { building: "yes", height: "1" }).top).toBe(2.5);
    expect(resolveHeight("way/1", { building: "yes", height: "900" }).top).toBe(300);
  });

  it("min_height and building:min_level raise the base", () => {
    expect(resolveHeight("way/1", { "building:part": "yes", height: "30", min_height: "10" }).base).toBe(10);
    expect(resolveHeight("way/1", { "building:part": "yes", height: "30", "building:min_level": "2" }).base).toBeCloseTo(6.4);
  });

  it("keeps at least 1 m of wall when base >= top", () => {
    expect(resolveHeight("way/1", { building: "yes", height: "10", min_height: "12" })).toMatchObject({ base: 9, top: 10 });
  });

  it("resolves every building in the fixture into range", () => {
    const { polygons } = parseOsm(loadFixture());
    const buildings = polygons.filter((p) => p.tags["building"] || p.tags["building:part"]);
    expect(buildings.length).toBeGreaterThan(10);
    for (const b of buildings) {
      const h = resolveHeight(b.id, b.tags);
      expect(h.top).toBeGreaterThanOrEqual(2.5);
      expect(h.top).toBeLessThanOrEqual(300);
      expect(h.base).toBeLessThan(h.top);
    }
  });
});
