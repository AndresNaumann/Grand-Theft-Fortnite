import { MeshLambertMaterial, type MeshLambertMaterialParameters } from "three";

/**
 * Procedural surface detail (M1.5, SPEC §7.2: patterns are computed in the shader, no texture files).
 * Extends MeshLambertMaterial so lighting, vertex colors and (later) toon shading keep working.
 *
 * Detail UVs come from worldgen (see MeshBuilder): ribbons = (arc length m, across -1..1),
 * walls = (bays, floors). Everything else uses world-space xz.
 */
export type DetailKind = "grass" | "asphalt" | "paving" | "building" | "water";

/** Shared clock for animated detail (water). Updated once per frame by <DetailClock />. */
export const detailTime = { value: 0 };

const COMMON = /* glsl */ `
  varying vec2 vDetailUv;
  varying vec3 vDetailWorld;
  varying float vDetailNormalY;
`;

const NOISE = /* glsl */ `
  uniform float uDetailTime;
  float dHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float dNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dHash(i), dHash(i + vec2(1.0, 0.0)), u.x),
               mix(dHash(i + vec2(0.0, 1.0)), dHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // 1 on a line of half-width w (in pattern units) around integer values of x; antialiased.
  float dLine(float x, float w) {
    float d = abs(fract(x + 0.5) - 0.5);
    float aa = fwidth(x) * 0.75;
    return 1.0 - smoothstep(w - aa, w + aa, d);
  }
  // 1 inside [lo, hi] of fract(x); antialiased.
  float dBand(float x, float lo, float hi) {
    float f = fract(x);
    float aa = fwidth(x) * 0.75;
    return smoothstep(lo - aa, lo + aa, f) * (1.0 - smoothstep(hi - aa, hi + aa, f));
  }
`;

const PATTERNS: Record<DetailKind, string> = {
  grass: /* glsl */ `
    float n = dNoise(vDetailWorld.xz * 0.12) * 0.6 + dNoise(vDetailWorld.xz * 0.8) * 0.4;
    diffuseColor.rgb *= 0.9 + 0.18 * n;
  `,
  asphalt: /* glsl */ `
    float grain = dNoise(vDetailWorld.xz * 3.0);
    float patches = dNoise(vDetailWorld.xz * 0.1);
    diffuseColor.rgb *= 0.93 + 0.08 * grain + 0.1 * (patches - 0.5);
  `,
  paving: /* glsl */ `
    if (vDetailNormalY > 0.5) {
      float joints = 0.0;
      if (abs(vDetailUv.y) <= 1.5) {
        joints = max(dLine(vDetailUv.x / 1.5, 0.02), dLine(vDetailUv.y * 0.5 + 0.5, 0.012));
      }
      float grain = dNoise(vDetailWorld.xz * 2.0);
      diffuseColor.rgb *= (0.96 + 0.07 * grain) * (1.0 - 0.2 * joints);
    }
  `,
  building: /* glsl */ `
    if (abs(vDetailNormalY) < 0.5) {
      // Windows on the bay/floor grid (floor 3.2 m, bay 3 m), sills underneath.
      float win = dBand(vDetailUv.x, 0.28, 0.72) * dBand(vDetailUv.y, 0.32, 0.8);
      float sill = dBand(vDetailUv.x, 0.25, 0.75) * dBand(vDetailUv.y, 0.27, 0.32);
      vec3 glass = mix(vec3(0.16, 0.24, 0.38), vec3(0.42, 0.6, 0.8), fract(vDetailUv.y) * 0.9);
      diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * 0.85);
      diffuseColor.rgb *= 1.0 + 0.18 * sill;
      // Soft darkening at the base reads as contact shadow.
      diffuseColor.rgb *= mix(0.8, 1.0, smoothstep(0.0, 1.6, vDetailWorld.y));
    } else {
      diffuseColor.rgb *= 0.96 + 0.06 * dNoise(vDetailWorld.xz * 1.5);
    }
  `,
  water: /* glsl */ `
    vec2 p = vDetailWorld.xz * 0.25;
    float n = dNoise(p + vec2(uDetailTime * 0.12, uDetailTime * 0.07)) * 0.5
            + dNoise(p * 2.3 - vec2(uDetailTime * 0.1, 0.0)) * 0.5;
    diffuseColor.rgb *= 0.93 + 0.12 * n;
    diffuseColor.rgb += vec3(0.08) * smoothstep(0.72, 0.8, n);
  `,
};

export function makeDetailMaterial(kind: DetailKind, params: MeshLambertMaterialParameters = {}): MeshLambertMaterial {
  const material = new MeshLambertMaterial(params);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDetailTime = detailTime;
    shader.vertexShader = COMMON + shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       vDetailUv = uv;
       vDetailWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
       vDetailNormalY = normal.y;`,
    );
    shader.fragmentShader = COMMON + NOISE + shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
       ${PATTERNS[kind]}`,
    );
  };
  material.customProgramCacheKey = () => `detail-${kind}`;
  return material;
}
