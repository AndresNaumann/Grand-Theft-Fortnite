import { describe, expect, it } from "vitest";
import { hashString, rngFor } from "../src/rng.ts";

const take = (n: number, f: () => number) => Array.from({ length: n }, f);

describe("rng", () => {
  it("hashString is stable (golden values)", () => {
    // FNV-1a 32-bit reference values.
    expect(hashString("")).toBe(0x811c9dc5);
    expect(hashString("a")).toBe(0xe40c292c);
    expect(hashString("foobar")).toBe(0xbf9cf968);
  });

  it("same key + salt => identical sequence", () => {
    const a = rngFor("way/123456", "height");
    const b = rngFor("way/123456", "height");
    expect(take(50, a.next)).toEqual(take(50, b.next));
  });

  it("different keys or salts => different sequences", () => {
    const base = take(5, rngFor("way/1").next);
    expect(take(5, rngFor("way/2").next)).not.toEqual(base);
    expect(take(5, rngFor("way/1", "color").next)).not.toEqual(base);
  });

  it("numeric and string keys are equivalent", () => {
    expect(take(5, rngFor(42).next)).toEqual(take(5, rngFor("42").next));
  });

  it("range, int and pick respect bounds", () => {
    const r = rngFor("node/7");
    for (let i = 0; i < 2000; i++) {
      const f = r.range(6, 14);
      expect(f).toBeGreaterThanOrEqual(6);
      expect(f).toBeLessThan(14);
      const n = r.int(1, 3);
      expect([1, 2, 3]).toContain(n);
      expect(["x", "y"]).toContain(r.pick(["x", "y"]));
    }
  });

  it("is roughly uniform", () => {
    const r = rngFor("relation/99");
    const buckets = new Array<number>(10).fill(0);
    const N = 20000;
    for (let i = 0; i < N; i++) buckets[Math.floor(r.next() * 10)]!++;
    for (const b of buckets) expect(Math.abs(b - N / 10)).toBeLessThan(N / 10 * 0.1);
  });

  it("pick throws on empty input", () => {
    expect(() => rngFor(1).pick([])).toThrow();
  });
});
