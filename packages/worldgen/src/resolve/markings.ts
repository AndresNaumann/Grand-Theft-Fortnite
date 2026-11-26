import type { Tags } from "../types.ts";

export const BIKE_LANE_WIDTH = 1.5;
const LINE_WIDTH = 0.12;
const DOUBLE_GAP = 0.1;

export type StripeColor = "white" | "yellow" | "bike";

/** One painted stripe along a road. Offsets are across the road, right of the way direction positive. */
export interface Stripe {
  /** Signed offset of the stripe's center from the centerline (m). */
  offset: number;
  width: number;
  color: StripeColor;
  dashed: boolean;
}

/** Road class ranks, used for center-line style and sign placement. Links use their parent class. */
const RANK: Readonly<Record<string, number>> = {
  motorway: 7,
  trunk: 6,
  primary: 5,
  secondary: 4,
  tertiary: 3,
  unclassified: 2,
  residential: 2,
  living_street: 1,
  service: 0,
};

export function roadRank(tags: Tags): number {
  const hw = (tags["highway"] ?? "").replace(/_link$/, "");
  return RANK[hw] ?? 0;
}

/** +1 = one-way along the way, -1 = one-way against it, 0 = two-way. */
export function onewayDirection(tags: Tags): -1 | 0 | 1 {
  const v = tags["oneway"];
  if (v === "yes" || v === "true" || v === "1") return 1;
  if (v === "-1" || v === "reverse") return -1;
  if (v === "no") return 0;
  if (tags["junction"] === "roundabout" || tags["highway"] === "motorway") return 1;
  return 0;
}

const PAINTED = new Set(["lane", "track"]);

/** Which sides of the way (relative to its direction) carry a painted bike lane. */
export function bikeLaneSides(tags: Tags): { left: boolean; right: boolean } {
  const both = tags["cycleway:both"];
  const plain = tags["cycleway"];
  let left = PAINTED.has(tags["cycleway:left"] ?? "") || PAINTED.has(both ?? "");
  let right = PAINTED.has(tags["cycleway:right"] ?? "") || PAINTED.has(both ?? "");
  if (PAINTED.has(plain ?? "")) {
    const dir = onewayDirection(tags);
    if (dir === 0) left = right = true;
    else if (dir === 1) right = true;
    else left = true; // one-way against the way: travel's right is the way's left
  }
  return { left, right };
}

/** Extra road width (m) for painted bike lanes; added on top of SPEC §6.5 widths. */
export function bikeLaneExtraWidth(tags: Tags): number {
  const { left, right } = bikeLaneSides(tags);
  return (Number(left) + Number(right)) * BIKE_LANE_WIDTH;
}

function intTag(v: string | undefined): number | undefined {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Road markings for a drivable way (US conventions, toy-simplified):
 * - two-way: yellow center line, double solid on tertiary and above (or 4+ lanes), dashed otherwise
 * - white dashed lines between same-direction lanes
 * - green painted bike lanes at the edges, separated by a solid white line
 * Service roads and living streets are unmarked.
 */
export function planMarkings(tags: Tags, width: number): Stripe[] {
  const rank = roadRank(tags);
  if (rank <= 1 || width < 4) return [];
  const hw = width / 2;
  const out: Stripe[] = [];

  const bikes = bikeLaneSides(tags);
  const leftEdge = -hw + (bikes.left ? BIKE_LANE_WIDTH : 0);
  const rightEdge = hw - (bikes.right ? BIKE_LANE_WIDTH : 0);
  if (bikes.left) {
    out.push({ offset: -hw + BIKE_LANE_WIDTH / 2, width: BIKE_LANE_WIDTH, color: "bike", dashed: false });
    out.push({ offset: leftEdge, width: LINE_WIDTH, color: "white", dashed: false });
  }
  if (bikes.right) {
    out.push({ offset: hw - BIKE_LANE_WIDTH / 2, width: BIKE_LANE_WIDTH, color: "bike", dashed: false });
    out.push({ offset: rightEdge, width: LINE_WIDTH, color: "white", dashed: false });
  }

  const dir = onewayDirection(tags);
  const lanes = intTag(tags["lanes"]) ?? (dir === 0 ? 2 : 1);
  if (lanes < 2) return out;
  const laneWidth = (rightEdge - leftEdge) / lanes;

  // Driving on the right: forward lanes are right of the centerline, backward lanes left of it.
  let backward = 0;
  if (dir === 0) {
    const fwd = intTag(tags["lanes:forward"]);
    const bwd = intTag(tags["lanes:backward"]);
    backward = bwd ?? (fwd !== undefined ? lanes - fwd : Math.floor(lanes / 2));
    backward = Math.min(lanes - 1, Math.max(1, backward));
  }

  for (let k = 1; k < lanes; k++) {
    const s = leftEdge + k * laneWidth;
    if (dir === 0 && k === backward) {
      if (rank >= 3 || lanes >= 4) {
        out.push({ offset: s - DOUBLE_GAP, width: LINE_WIDTH * 0.85, color: "yellow", dashed: false });
        out.push({ offset: s + DOUBLE_GAP, width: LINE_WIDTH * 0.85, color: "yellow", dashed: false });
      } else {
        out.push({ offset: s, width: LINE_WIDTH, color: "yellow", dashed: true });
      }
    } else {
      out.push({ offset: s, width: LINE_WIDTH, color: "white", dashed: true });
    }
  }
  return out;
}
