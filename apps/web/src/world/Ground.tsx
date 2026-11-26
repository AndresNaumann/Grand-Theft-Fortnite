import { useMemo } from "react";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { PALETTE } from "../style/palette";

const HALF_EXTENT = 1000; // m
/**
 * The ground collider is tiled, not one huge cuboid (deviation from SPEC §8.5, Decisions Log #13):
 * Rapier's character-controller shape casts lose precision against very large boxes, and the
 * capsule sank ~17 cm into a 2 km cuboid while walking. 200 m tiles keep it within 2 mm.
 */
const TILE = 200;

/** Ground plane at y = 0 (SPEC §6.6) with a fixed, tiled collider below it. */
export function Ground() {
  const tiles = useMemo(() => {
    const out: [number, number][] = [];
    for (let x = -HALF_EXTENT; x < HALF_EXTENT; x += TILE) {
      for (let z = -HALF_EXTENT; z < HALF_EXTENT; z += TILE) out.push([x + TILE / 2, z + TILE / 2]);
    }
    return out;
  }, []);

  return (
    <RigidBody type="fixed" colliders={false}>
      {tiles.map(([x, z]) => (
        <CuboidCollider key={`${x},${z}`} args={[TILE / 2, 0.5, TILE / 2]} position={[x, -0.5, z]} />
      ))}
      <mesh rotation-x={-Math.PI / 2} renderOrder={0}>
        <planeGeometry args={[HALF_EXTENT * 2, HALF_EXTENT * 2]} />
        <meshLambertMaterial color={PALETTE.grass} />
      </mesh>
    </RigidBody>
  );
}
