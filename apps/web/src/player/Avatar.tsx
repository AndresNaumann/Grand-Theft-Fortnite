import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { PALETTE } from "../style/palette";

/** What the avatar needs from the character simulation each frame. */
export interface AvatarMotion {
  /** Horizontal ground speed (m/s). */
  moveSpeed: number;
  grounded: boolean;
  /** Vertical velocity (m/s). */
  vy: number;
}

interface Props {
  motion: RefObject<AvatarMotion>;
  /** Distance from the avatar origin (capsule center) down to the feet. */
  feetOffset: number;
  /** Speed at which the run cycle reaches full amplitude. */
  fullSpeed: number;
}

const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

/**
 * MVP capsule-person (SPEC §8.2) with a procedural run cycle.
 * Stride phase advances with distance travelled (not time), so the feet don't skate at any speed.
 * Faces +z in local space.
 */
export function Avatar({ motion, feetOffset, fullSpeed }: Props) {
  const root = useRef<Group>(null);
  const hips = useRef<Group>(null);
  const upper = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);

  const anim = useRef({ phase: 0, amp: 0, air: 0, squash: 0, wasGrounded: true, time: 0 });

  useFrame((_, rawDelta) => {
    const m = motion.current;
    const a = anim.current;
    if (!m || !root.current || !hips.current || !upper.current) return;
    if (!legL.current || !legR.current || !armL.current || !armR.current) return;
    const dt = Math.min(rawDelta, 0.1);
    a.time += dt;

    const run = Math.min(m.moveSpeed / fullSpeed, 1); // 0 idle … 1 sprint
    const moving = m.grounded && m.moveSpeed > 0.3;

    // Stride: ~1.5 m per cycle walking, ~2.2 m sprinting.
    const strideLength = 1.5 + 0.7 * run;
    if (moving) a.phase += (m.moveSpeed / strideLength) * Math.PI * 2 * dt;

    a.amp = damp(a.amp, moving ? 0.45 + 0.6 * run : 0, 12, dt);
    a.air = damp(a.air, m.grounded ? 0 : 1, 10, dt);

    // Landing squash.
    if (m.grounded && !a.wasGrounded) a.squash = 1;
    a.wasGrounded = m.grounded;
    a.squash = damp(a.squash, 0, 9, dt);

    const swing = Math.sin(a.phase) * a.amp;
    const bob = Math.abs(Math.cos(a.phase)) * 0.07 * a.amp;

    // Legs: alternate swing; in the air, tuck one forward and one back.
    legL.current.rotation.x = swing * (1 - a.air) + -0.7 * a.air;
    legR.current.rotation.x = -swing * (1 - a.air) + 0.35 * a.air;

    // Arms: counter-swing, slightly out; in the air, throw them up and out.
    armL.current.rotation.x = -swing * 0.9 * (1 - a.air);
    armR.current.rotation.x = swing * 0.9 * (1 - a.air);
    armL.current.rotation.z = -0.12 - 1.3 * a.air;
    armR.current.rotation.z = 0.12 + 1.3 * a.air;

    // Upper body: lean into the run, small twist with the stride, idle breathing.
    upper.current.rotation.x = damp(upper.current.rotation.x, moving ? 0.08 + 0.2 * run : 0, 8, dt);
    upper.current.rotation.y = Math.sin(a.phase) * 0.12 * a.amp;
    upper.current.scale.y = 1 + Math.sin(a.time * 2.2) * 0.015 * (1 - a.amp);

    hips.current.position.y = HIP_HEIGHT + bob;

    const sq = a.squash * 0.18;
    root.current.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
  });

  const shirt = PALETTE.walls[2];
  const pants = PALETTE.roofs[2];
  const skin = PALETTE.walls[0];
  const dark = PALETTE.outline;

  return (
    <group ref={root} position={[0, -feetOffset, 0]}>
      <group ref={hips} position={[0, HIP_HEIGHT, 0]}>
        <group ref={legL} position={[-0.13, 0, 0]}>
          <mesh position={[0, -0.25, 0]}>
            <capsuleGeometry args={[0.1, 0.3, 4, 8]} />
            <meshLambertMaterial color={pants} />
          </mesh>
        </group>
        <group ref={legR} position={[0.13, 0, 0]}>
          <mesh position={[0, -0.25, 0]}>
            <capsuleGeometry args={[0.1, 0.3, 4, 8]} />
            <meshLambertMaterial color={pants} />
          </mesh>
        </group>

        <group ref={upper}>
          <mesh position={[0, 0.35, 0]}>
            <capsuleGeometry args={[0.28, 0.4, 6, 12]} />
            <meshLambertMaterial color={shirt} />
          </mesh>
          <mesh position={[0, 0.98, 0]}>
            <sphereGeometry args={[0.25, 16, 12]} />
            <meshLambertMaterial color={skin} />
          </mesh>
          <mesh position={[-0.09, 1.02, 0.22]}>
            <sphereGeometry args={[0.04, 8, 6]} />
            <meshBasicMaterial color={dark} />
          </mesh>
          <mesh position={[0.09, 1.02, 0.22]}>
            <sphereGeometry args={[0.04, 8, 6]} />
            <meshBasicMaterial color={dark} />
          </mesh>

          <group ref={armL} position={[-0.37, 0.6, 0]}>
            <mesh position={[0, -0.2, 0]}>
              <capsuleGeometry args={[0.08, 0.26, 4, 8]} />
              <meshLambertMaterial color={shirt} />
            </mesh>
            <mesh position={[0, -0.42, 0]}>
              <sphereGeometry args={[0.08, 8, 6]} />
              <meshLambertMaterial color={skin} />
            </mesh>
          </group>
          <group ref={armR} position={[0.37, 0.6, 0]}>
            <mesh position={[0, -0.2, 0]}>
              <capsuleGeometry args={[0.08, 0.26, 4, 8]} />
              <meshLambertMaterial color={shirt} />
            </mesh>
            <mesh position={[0, -0.42, 0]}>
              <sphereGeometry args={[0.08, 8, 6]} />
              <meshLambertMaterial color={skin} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

const HIP_HEIGHT = 0.5;
