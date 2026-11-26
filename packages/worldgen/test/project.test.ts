import { describe, expect, it } from "vitest";
import { makeProjection, projectBBox } from "../src/project.ts";

describe("projection (SPEC §6.3)", () => {
  const origin = { lat: 42.35, lon: -71.08 };
  const proj = makeProjection(origin);

  it("maps the origin to (0, 0)", () => {
    const [x, z] = proj.toLocal(origin.lon, origin.lat);
    expect(x).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(0, 9);
  });

  it("north is -z, east is +x, in meters", () => {
    const [, zN] = proj.toLocal(origin.lon, origin.lat + 0.001);
    expect(zN).toBeCloseTo(-110.54, 6);
    const [xE] = proj.toLocal(origin.lon + 0.001, origin.lat);
    expect(xE).toBeCloseTo(111.32 * Math.cos((42.35 * Math.PI) / 180), 6);
  });

  // SPEC §6.3's constants are equatorial, so at Boston's latitude N-S distances run ~0.5% short
  // (≈1.7 m over 1.2 km here). The distortion is uniform, so shapes and angles are unaffected.
  it("is within 0.6% of the great-circle distance at MVP scale", () => {
    const lat2 = origin.lat + 0.006;
    const lon2 = origin.lon + 0.01;
    const [x, z] = proj.toLocal(lon2, lat2);
    const R = 6_371_008.8;
    const rad = Math.PI / 180;
    const dLat = (lat2 - origin.lat) * rad;
    const dLon = (lon2 - origin.lon) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(origin.lat * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    const haversine = 2 * R * Math.asin(Math.sqrt(a));
    expect(Math.abs(Math.hypot(x, z) - haversine) / haversine).toBeLessThan(0.006);
  });

  it("round-trips", () => {
    const [x, z] = proj.toLocal(-71.0712, 42.3561);
    const [lon, lat] = proj.toLonLat(x, z);
    expect(lon).toBeCloseTo(-71.0712, 10);
    expect(lat).toBeCloseTo(42.3561, 10);
  });

  it("projects a bbox to symmetric bounds around a centered origin", () => {
    const b = projectBBox([42.344, -71.09, 42.356, -71.07], proj);
    expect(b.minX).toBeCloseTo(-b.maxX, 6);
    expect(b.minZ).toBeCloseTo(-b.maxZ, 6);
    expect(b.minZ).toBeLessThan(0); // north edge
  });
});
