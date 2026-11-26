import type { BBox } from "./types.ts";

/**
 * Overpass QL query for an area (SPEC §6.2; street-furniture nodes added in M1.5). Builds the string only; never fetches.
 * bbox order: south, west, north, east.
 */
export function buildOverpassQuery(bbox: BBox, timeoutSeconds = 60): string {
  const b = bbox.join(",");
  return `[out:json][timeout:${timeoutSeconds}];
(
  way["building"](${b});
  relation["building"](${b});
  way["building:part"](${b});
  way["highway"](${b});
  way["landuse"](${b});
  way["leisure"~"^(park|garden|pitch|playground)$"](${b});
  way["natural"~"^(water|wood|scrub|grassland|beach)$"](${b});
  relation["natural"="water"](${b});
  way["waterway"~"^(river|canal|stream)$"](${b});
  node["natural"="tree"](${b});
  node["highway"~"^(stop|give_way|traffic_signals|street_lamp)$"](${b});
);
out body; >; out skel qt;`;
}
