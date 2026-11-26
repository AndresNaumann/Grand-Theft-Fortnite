import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  BoxGeometry,
  SphereGeometry,
  SRGBColorSpace,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hexToLinear } from "@polyworld/worldgen";
import { PALETTE } from "../style/palette";

/**
 * Low-poly street-furniture models, built from primitives with palette vertex colors (no asset files).
 * Local frame: +z faces the traffic or pedestrians the prop serves; y = 0 is the ground.
 */

/** Non-indexed copy with a solid vertex color (and no UVs), ready to merge. */
export function painted(g: BufferGeometry, hex: string, scale = 1): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const [r, gg, b] = hexToLinear(hex);
  const n = ng.getAttribute("position").count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([r * scale, gg * scale, b * scale], i * 3);
  ng.setAttribute("color", new BufferAttribute(colors, 3));
  ng.deleteAttribute("uv");
  return ng;
}

const merge = (parts: BufferGeometry[]) => mergeGeometries(parts)!;

// ── Signs ──────────────────────────────────────────────────────────────────────────────
const SIGN_HEIGHT = 2.3;
export const STOP_RADIUS = 0.38;
export const YIELD_RADIUS = 0.5;

/** Pole plus the plain metal back of an octagonal (stop) or triangular (yield) sign. */
export function signBody(shape: "stop" | "yield"): BufferGeometry {
  const pole = painted(new CylinderGeometry(0.035, 0.035, SIGN_HEIGHT + 0.2, 6).translate(0, (SIGN_HEIGHT + 0.2) / 2, 0), PALETTE.metal);
  const back =
    shape === "stop"
      ? new CircleGeometry(STOP_RADIUS, 8, Math.PI / 8)
      : new CircleGeometry(YIELD_RADIUS, 3, -Math.PI / 2);
  back.rotateY(Math.PI).translate(0, SIGN_HEIGHT, 0.02);
  return merge([pole, painted(back, PALETTE.metal)]);
}

/** The printed front face, UV-mapped to its canvas texture. */
export function signFace(shape: "stop" | "yield"): BufferGeometry {
  const g =
    shape === "stop"
      ? new CircleGeometry(STOP_RADIUS, 8, Math.PI / 8)
      : new CircleGeometry(YIELD_RADIUS, 3, -Math.PI / 2);
  return g.translate(0, SIGN_HEIGHT, 0.04);
}

function polygonPath(ctx: CanvasRenderingContext2D, sides: number, start: number, r: number, c: number) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = start + (i / sides) * Math.PI * 2;
    const x = c + Math.cos(a) * r;
    const y = c - Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 256): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, size);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function stopTexture(): CanvasTexture {
  return canvasTexture((ctx, s) => {
    const c = s / 2;
    polygonPath(ctx, 8, Math.PI / 8, c, c);
    ctx.fillStyle = PALETTE.signWhite;
    ctx.fill();
    polygonPath(ctx, 8, Math.PI / 8, c * 0.9, c);
    ctx.fillStyle = PALETTE.signRed;
    ctx.fill();
    ctx.fillStyle = PALETTE.signWhite;
    ctx.font = `900 ${Math.round(s * 0.3)}px system-ui, "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("STOP", c, c + s * 0.01, s * 0.78);
  });
}

export function yieldTexture(): CanvasTexture {
  return canvasTexture((ctx, s) => {
    const c = s / 2;
    polygonPath(ctx, 3, -Math.PI / 2, c, c);
    ctx.fillStyle = PALETTE.signRed;
    ctx.fill();
    polygonPath(ctx, 3, -Math.PI / 2, c * 0.55, c);
    ctx.fillStyle = PALETTE.signWhite;
    ctx.fill();
    ctx.fillStyle = PALETTE.signRed;
    ctx.font = `900 ${Math.round(s * 0.085)}px system-ui, "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("YIELD", c, c - s * 0.1, s * 0.4);
  });
}

// ── Traffic lights ─────────────────────────────────────────────────────────────────────
const ARM_LENGTH = 4;
const HEAD_X = -ARM_LENGTH + 0.4;
const HEAD_Y = 4.4;
const LAMP_YS = [HEAD_Y + 0.33, HEAD_Y, HEAD_Y - 0.33] as const; // red, yellow, green

/** Mast-arm signal: pole at the curb, arm reaching over the road (local -x), head facing +z. */
export function signalBody(): BufferGeometry {
  const pole = painted(new CylinderGeometry(0.09, 0.11, 5.2, 8).translate(0, 2.6, 0), PALETTE.signalHousing);
  const arm = painted(
    new CylinderGeometry(0.06, 0.06, ARM_LENGTH, 6).rotateZ(Math.PI / 2).translate(-ARM_LENGTH / 2, 5.0, 0),
    PALETTE.signalHousing,
  );
  const hanger = painted(new CylinderGeometry(0.03, 0.03, 0.3, 4).translate(HEAD_X, 4.95, 0), PALETTE.signalHousing);
  const head = painted(new BoxGeometry(0.36, 1.06, 0.28).translate(HEAD_X, HEAD_Y, 0), PALETTE.signalHousing);
  const visors = LAMP_YS.map((y) =>
    painted(new BoxGeometry(0.32, 0.04, 0.16).translate(HEAD_X, y + 0.15, 0.2), PALETTE.signalHousing),
  );
  // A second, pedestrian-height head on the pole so signals read at street level.
  const low = painted(new BoxGeometry(0.3, 0.9, 0.24).translate(0, 3.0, 0.2), PALETTE.signalHousing);
  return merge([pole, arm, hanger, head, low, ...visors]);
}

/** The three lamps of both heads; `state` picks which one is lit (unlit ones are dimmed). */
export function signalLamps(state: "red" | "green"): BufferGeometry {
  const colors = [PALETTE.signalRed, PALETTE.signalYellow, PALETTE.signalGreen];
  const lit = state === "red" ? 0 : 2;
  const parts: BufferGeometry[] = [];
  colors.forEach((hex, i) => {
    const dim = i === lit ? 1 : 0.22;
    parts.push(painted(new CircleGeometry(0.12, 12).translate(HEAD_X, LAMP_YS[i]!, 0.145), hex, dim));
    parts.push(painted(new CircleGeometry(0.1, 12).translate(0, 3.27 - i * 0.27, 0.325), hex, dim));
  });
  return merge(parts);
}

// ── Street lamps (Back Bay "acorn" style) ──────────────────────────────────────────────
export function lampBody(): BufferGeometry {
  return merge([
    painted(new CylinderGeometry(0.17, 0.22, 0.55, 8).translate(0, 0.275, 0), PALETTE.lampPost),
    painted(new CylinderGeometry(0.06, 0.09, 3.3, 8).translate(0, 2.2, 0), PALETTE.lampPost),
    painted(new CylinderGeometry(0.16, 0.1, 0.16, 8).translate(0, 3.9, 0), PALETTE.lampPost),
    painted(new ConeGeometry(0.17, 0.28, 8).translate(0, 4.53, 0), PALETTE.lampPost),
    painted(new SphereGeometry(0.035, 6, 4).translate(0, 4.7, 0), PALETTE.lampPost),
  ]);
}

/** The glowing acorn globe (drawn unlit so it reads as a light). */
export function lampGlobe(): BufferGeometry {
  return painted(new SphereGeometry(0.24, 12, 8).scale(1, 1.25, 1).translate(0, 4.2, 0), PALETTE.lampGlobe);
}

// ── Street-name signs ──────────────────────────────────────────────────────────────────
export const NAME_POST_HEIGHT = 3.05;
export function namePost(): BufferGeometry {
  return painted(new CylinderGeometry(0.04, 0.04, NAME_POST_HEIGHT, 6).translate(0, NAME_POST_HEIGHT / 2, 0), PALETTE.metal);
}

export interface BladeAtlas {
  texture: CanvasTexture;
  /** [u0, v0, u1, v1] for a name. */
  uv(name: string): [number, number, number, number];
}

/** All street names in one canvas atlas: green blades with white text and border, US style. */
export function buildBladeAtlas(names: readonly string[]): BladeAtlas {
  const unique = [...new Set(names)].sort();
  const COLS = 2;
  const CELL_W = 512;
  const CELL_H = 96;
  const rows = Math.max(1, Math.ceil(unique.length / COLS));
  const canvas = document.createElement("canvas");
  canvas.width = COLS * CELL_W;
  canvas.height = rows * CELL_H;
  const ctx = canvas.getContext("2d")!;
  const index = new Map<string, number>();
  unique.forEach((name, i) => {
    index.set(name, i);
    const x = (i % COLS) * CELL_W;
    const y = Math.floor(i / COLS) * CELL_H;
    ctx.fillStyle = PALETTE.signGreen;
    ctx.fillRect(x, y, CELL_W, CELL_H);
    ctx.strokeStyle = PALETTE.signWhite;
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 8, y + 8, CELL_W - 16, CELL_H - 16);
    ctx.fillStyle = PALETTE.signWhite;
    ctx.font = `700 52px system-ui, "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, x + CELL_W / 2, y + CELL_H / 2 + 2, CELL_W - 48);
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return {
    texture,
    uv(name) {
      const i = index.get(name) ?? 0;
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const u0 = (col * CELL_W) / canvas.width;
      const u1 = ((col + 1) * CELL_W) / canvas.width;
      const v1 = 1 - (row * CELL_H) / canvas.height; // CanvasTexture.flipY: canvas top is v = 1
      const v0 = 1 - ((row + 1) * CELL_H) / canvas.height;
      return [u0, v0, u1, v1];
    },
  };
}

/** One merged mesh of every blade: two back-to-back quads each, so text reads correctly from both sides. */
export function bladeGeometry(
  signs: readonly { x: number; z: number; blades: readonly { text: string; rotY: number }[] }[],
  atlas: BladeAtlas,
): BufferGeometry {
  const HALF_W = 0.62;
  const HALF_H = 0.12;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const quad = (
    c: readonly [number, number, number],
    X: readonly [number, number],
    Z: readonly [number, number],
    side: 1 | -1,
    [u0, v0, u1, v1]: [number, number, number, number],
  ) => {
    // From the viewer's side, "right" is +X on the front and -X on the back.
    const rx = X[0] * side;
    const rz = X[1] * side;
    const ox = c[0] + Z[0] * 0.01 * side;
    const oz = c[2] + Z[1] * 0.01 * side;
    const corner = (sx: number, sy: number) => [ox + rx * HALF_W * sx, c[1] + HALF_H * sy, oz + rz * HALF_W * sx];
    const BL = corner(-1, -1);
    const BR = corner(1, -1);
    const TR = corner(1, 1);
    const TL = corner(-1, 1);
    for (const [p, u, v] of [
      [BL, u0, v0],
      [BR, u1, v0],
      [TR, u1, v1],
      [BL, u0, v0],
      [TR, u1, v1],
      [TL, u0, v1],
    ] as const) {
      pos.push(...p);
      nrm.push(Z[0] * side, 0, Z[1] * side);
      uv.push(u, v);
    }
  };
  for (const s of signs) {
    s.blades.forEach((b, i) => {
      const X = [Math.cos(b.rotY), -Math.sin(b.rotY)] as const;
      const Z = [Math.sin(b.rotY), Math.cos(b.rotY)] as const;
      const c = [s.x, NAME_POST_HEIGHT - 0.16 - i * 0.27, s.z] as const;
      const r = atlas.uv(b.text);
      quad(c, X, Z, 1, r);
      quad(c, X, Z, -1, r);
    });
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  g.computeBoundingSphere();
  return g;
}
