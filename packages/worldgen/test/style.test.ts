import { describe, expect, it } from "vitest";
import { PALETTE } from "../src/palette.ts";
import { buildingColors, resolveAreaStyle } from "../src/resolve/style.ts";
import { buildOverpassQuery } from "../src/overpass.ts";

describe("buildingColors", () => {
  it("picks from the palette, stable per id", () => {
    const a = buildingColors("way/7");
    expect(PALETTE.walls).toContain(a.wall);
    expect(PALETTE.roofs).toContain(a.roof);
    expect(buildingColors("way/7")).toEqual(a);
  });

  it("varies across ids", () => {
    const walls = new Set(Array.from({ length: 50 }, (_, i) => buildingColors(`way/${i}`).wall));
    expect(walls.size).toBeGreaterThan(4);
  });
});

describe("resolveAreaStyle", () => {
  it.each([
    [{ natural: "water" }, "water"],
    [{ waterway: "riverbank" }, "water"],
    [{ landuse: "reservoir" }, "water"],
    [{ natural: "beach" }, "beach"],
    [{ natural: "wood" }, "forest"],
    [{ landuse: "forest" }, "forest"],
    [{ leisure: "park" }, "park"],
    [{ leisure: "garden" }, "park"],
    [{ leisure: "pitch" }, "pitch"],
    [{ leisure: "playground" }, "pitch"],
    [{ landuse: "grass" }, "grass"],
    [{ natural: "grassland" }, "grass"],
    [{ highway: "pedestrian", area: "yes" }, "plaza"],
  ])("%o -> %s", (tags, kind) => expect(resolveAreaStyle(tags)?.kind).toBe(kind));

  it("skips urban landuse (drawn as plain ground)", () => {
    expect(resolveAreaStyle({ landuse: "residential" })).toBeNull();
    expect(resolveAreaStyle({ landuse: "commercial" })).toBeNull();
  });

  it("only woods and parks get scattered trees", () => {
    expect(resolveAreaStyle({ leisure: "park" })?.trees).toBe(true);
    expect(resolveAreaStyle({ natural: "wood" })?.trees).toBe(true);
    expect(resolveAreaStyle({ landuse: "grass" })?.trees).toBe(false);
  });
});

describe("buildOverpassQuery (SPEC §6.2)", () => {
  const q = buildOverpassQuery([42.344, -71.09, 42.356, -71.07]);
  it("uses s,w,n,e bbox order and JSON output", () => {
    expect(q).toContain('way["building"](42.344,-71.09,42.356,-71.07);');
    expect(q.startsWith("[out:json][timeout:60];")).toBe(true);
    expect(q.trim().endsWith("out body; >; out skel qt;")).toBe(true);
  });
  it("includes every spec selector", () => {
    for (const s of [
      'relation["building"]',
      'way["building:part"]',
      'way["highway"]',
      'way["landuse"]',
      'way["leisure"~"^(park|garden|pitch|playground)$"]',
      'way["natural"~"^(water|wood|scrub|grassland|beach)$"]',
      'relation["natural"="water"]',
      'way["waterway"~"^(river|canal|stream)$"]',
      'node["natural"="tree"]',
    ]) {
      expect(q).toContain(s);
    }
  });
});
