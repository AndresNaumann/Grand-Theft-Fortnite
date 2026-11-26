import { RigidBody } from "@react-three/rapier";
import { PALETTE } from "../style/palette";

/**
 * M0-only movement test props, placed north of spawn (-z) so they're in view on load.
 * Exercises: autostep (0.2 m, 0.35 m climb; 0.6 m blocks), walls, walkable vs too-steep ramps.
 * Disable via WORLD.features.testCourse once real city geometry arrives (M1).
 */
interface Block {
  pos: [number, number, number];
  size: [number, number, number];
  rotX?: number;
  color: string;
}

const W = PALETTE.walls;

const BLOCKS: Block[] = [
  // Steps of increasing height: 0.2 and 0.35 auto-step, 0.6 needs a jump.
  { pos: [-6, 0.1, -8], size: [2, 0.2, 2], color: W[1] },
  { pos: [-3, 0.175, -8], size: [2, 0.35, 2], color: W[5] },
  { pos: [0, 0.3, -8], size: [2, 0.6, 2], color: W[2] },
  // A wall to walk into (should stop, not tunnel).
  { pos: [6, 2, -10], size: [8, 4, 1], color: W[3] },
  // A "building" block.
  { pos: [-12, 4, -18], size: [8, 8, 8], color: W[0] },
  { pos: [2, 6, -26], size: [6, 12, 6], color: W[6] },
  // Ramps: ~25° (climbable) and ~55° (too steep).
  { pos: [12, 1.2, -18], size: [4, 0.3, 6], rotX: (25 * Math.PI) / 180, color: W[4] },
  { pos: [18, 2, -18], size: [4, 0.3, 6], rotX: (55 * Math.PI) / 180, color: PALETTE.roofs[3] },
];

export function TestCourse() {
  return (
    <>
      {BLOCKS.map((b, i) => (
        <RigidBody key={i} type="fixed" colliders="cuboid" position={b.pos} rotation={[b.rotX ?? 0, 0, 0]}>
          <mesh>
            <boxGeometry args={b.size} />
            <meshLambertMaterial color={b.color} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
