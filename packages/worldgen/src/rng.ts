/**
 * Seeded, deterministic RNG. The ONLY source of randomness allowed in worldgen (SPEC §15.2).
 *
 * Streams are keyed by OSM id (e.g. "way/123456") plus an optional salt, so every feature
 * gets the same "random" choices on every run, on every machine, regardless of the order
 * in which features are processed.
 */

export type OsmKey = string | number;

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** Uniformly pick one element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
}

/** 32-bit FNV-1a hash of a string. Stable across JS engines. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: small, fast, good-enough PRNG with a 32-bit state. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create an RNG stream for a feature.
 * @param key  OSM id, e.g. "way/123456" or 123456.
 * @param salt Purpose of the stream (e.g. "height", "wallColor") so that independent
 *             decisions for the same feature don't share a sequence.
 */
export function rngFor(key: OsmKey, salt = ""): Rng {
  const next = mulberry32(hashString(`${String(key)}#${salt}`));
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error("rng.pick: empty array");
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
  };
}
