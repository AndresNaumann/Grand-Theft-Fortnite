import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { PALETTE } from "../style/palette";

const HALF_EXTENT = 1000; // m

/** Ground: one large fixed cuboid collider (SPEC §8.5) and a flat plane at y = 0 (SPEC §6.6). */
export function Ground() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[HALF_EXTENT, 0.5, HALF_EXTENT]} position={[0, -0.5, 0]} />
      <mesh rotation-x={-Math.PI / 2} renderOrder={0}>
        <planeGeometry args={[HALF_EXTENT * 2, HALF_EXTENT * 2]} />
        <meshLambertMaterial color={PALETTE.grass} />
      </mesh>
    </RigidBody>
  );
}
