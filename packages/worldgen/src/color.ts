export type RGB = readonly [number, number, number];

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** "#RRGGBB" (sRGB) -> linear RGB in [0, 1], the space three.js expects for vertex colors. */
export function hexToLinear(hex: string): RGB {
  const v = parseInt(hex.replace("#", ""), 16);
  return [srgbToLinear(((v >> 16) & 255) / 255), srgbToLinear(((v >> 8) & 255) / 255), srgbToLinear((v & 255) / 255)];
}
