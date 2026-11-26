import { rngFor, type OsmKey } from "../rng.ts";
import type { Tags } from "../types.ts";

export const LEVEL_HEIGHT = 3.2;
export const MIN_HEIGHT = 2.5;
export const MAX_HEIGHT = 300;

/** Default heights by `building` value (SPEC §6.4 step 4). */
const DEFAULT_BY_TYPE: Readonly<Record<string, number>> = {
  house: 7,
  detached: 7,
  semidetached_house: 7,
  apartments: 15,
  residential: 15,
  commercial: 14,
  retail: 14,
  office: 14,
  garage: 3,
  garages: 3,
  shed: 3,
  hut: 3,
  church: 18,
};

export type HeightSource = "height" | "levels" | "type" | "random";

export interface ResolvedHeight {
  /** Bottom of the walls above ground (m). */
  base: number;
  /** Top of the walls above ground (m), clamped to [2.5, 300]. */
  top: number;
  source: HeightSource;
}

/**
 * Parse a length tag: strips units ("12 m", "12m"), converts feet ("40'", "40 ft"),
 * takes the first value of a list ("3;4"). Returns undefined if not a positive finite number.
 */
export function parseLength(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const s = raw.trim().toLowerCase();
  const n = parseFloat(s.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return undefined;
  const feet = /^[\d.,\s]+('|ft|feet)/.test(s);
  return feet ? n * 0.3048 : n;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Building height resolution (SPEC §6.4). First match wins:
 * 2. `height` · 3. `building:levels` × 3.2 + `roof:levels` × 3.2 · 4. default by `building` value · 5. seeded random [6, 14].
 * (Step 1, AI enrichment, arrives in M5.)
 * `min_height` / `building:min_level` raise the base.
 */
export function resolveHeight(id: OsmKey, tags: Tags): ResolvedHeight {
  let top: number;
  let source: HeightSource;

  const height = parseLength(tags["height"]);
  const levels = parseLength(tags["building:levels"]);
  if (height !== undefined && height > 0) {
    top = height;
    source = "height";
  } else if (levels !== undefined && levels > 0) {
    const roofLevels = parseLength(tags["roof:levels"]) ?? 0;
    top = (levels + roofLevels) * LEVEL_HEIGHT;
    source = "levels";
  } else {
    const typeDefault = DEFAULT_BY_TYPE[tags["building"] ?? tags["building:part"] ?? ""];
    if (typeDefault !== undefined) {
      top = typeDefault;
      source = "type";
    } else {
      top = rngFor(id, "height").range(6, 14);
      source = "random";
    }
  }
  top = clamp(top, MIN_HEIGHT, MAX_HEIGHT);

  const minHeight = parseLength(tags["min_height"]);
  const minLevel = parseLength(tags["building:min_level"]);
  let base = minHeight ?? (minLevel !== undefined ? minLevel * LEVEL_HEIGHT : 0);
  // A base at or above the top is bad data; keep at least 1 m of wall.
  if (base > top - 1) base = Math.max(0, top - 1);

  return { base, top, source };
}
