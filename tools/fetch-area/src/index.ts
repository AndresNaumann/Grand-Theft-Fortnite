/**
 * tools/fetch-area — save an area's OSM data from Overpass to disk (SPEC §5, §6.2).
 *
 *   pnpm fetch-area                       # configured area -> data/<areaId>.osm.json (cached)
 *   pnpm fetch-area --force               # re-download even if cached
 *   pnpm fetch-area --bbox s,w,n,e --out path/to/file.json
 *
 * Respects the Overpass usage policy: one request, cached, identifies itself, and backs off on 429/504.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildOverpassQuery, type BBox } from "@polyworld/worldgen";
import { WORLD } from "../../../apps/web/src/config/world.config.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DEFAULT_ENDPOINT = "https://overpass-api.de/api/interpreter";

const { values } = parseArgs({
  options: {
    bbox: { type: "string" },
    out: { type: "string" },
    force: { type: "boolean", default: false },
    endpoint: { type: "string", default: DEFAULT_ENDPOINT },
  },
});

const bbox: BBox = values.bbox ? (values.bbox.split(",").map(Number) as unknown as BBox) : WORLD.bbox;
if (bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n))) {
  console.error(`Invalid --bbox "${values.bbox}". Expected south,west,north,east.`);
  process.exit(1);
}
const out = resolve(REPO_ROOT, values.out ?? `data/${WORLD.areaId}.osm.json`);

if (existsSync(out) && !values.force) {
  console.log(`Cached: ${out} (use --force to re-download)`);
  process.exit(0);
}

const query = buildOverpassQuery(bbox);
console.log(`Fetching bbox ${bbox.join(",")} from ${values.endpoint} …`);

let body: string | undefined;
for (let attempt = 1; attempt <= 3; attempt++) {
  const res = await fetch(values.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "polyworld-fetch-area/0.1",
    },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (res.ok) {
    body = await res.text();
    break;
  }
  if ((res.status === 429 || res.status === 504) && attempt < 3) {
    const wait = 15 * attempt;
    console.warn(`Overpass returned ${res.status}; retrying in ${wait}s …`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    continue;
  }
  console.error(`Overpass error ${res.status}: ${(await res.text()).slice(0, 500)}`);
  process.exit(1);
}
if (body === undefined) process.exit(1);

const json = JSON.parse(body) as { elements?: { type: string }[]; remark?: string };
if (json.remark) console.warn(`Overpass remark: ${json.remark}`);
const counts: Record<string, number> = {};
for (const el of json.elements ?? []) counts[el.type] = (counts[el.type] ?? 0) + 1;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, body);
console.log(`Saved ${(body.length / 1e6).toFixed(2)} MB to ${out}`, counts);
