import { useEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import {
  CapsuleCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierCollider,
  type RapierRigidBody,
} from "@react-three/rapier";
import type { Group, Object3D } from "three";
import { useGame } from "../store";
import { Avatar } from "./Avatar";
import { type Control, look } from "./input";

/** Character tuning (SPEC §8.2). */
export const CHARACTER = {
  radius: 0.35,
  halfHeight: 0.55,
  walkSpeed: 4.5,
  sprintSpeed: 8,
  jumpVelocity: 6,
  gravity: -20,
  autostepMaxHeight: 0.4,
  autostepMinWidth: 0.2,
  snapToGround: 0.5,
  maxSlopeClimbDeg: 45,
  /** Horizontal velocity smoothing rates (1/s). Higher = snappier. */
  groundAccel: 14,
  airAccel: 4,
  /** A jump press is remembered this long (s), so taps between physics steps or just before landing count. */
  jumpBuffer: 0.15,
  /** Jumping is still allowed this long (s) after walking off an edge. */
  coyoteTime: 0.1,
  /** Below this y the player is respawned. */
  killY: -30,
} as const;

const CENTER_TO_FEET = CHARACTER.halfHeight + CHARACTER.radius;

type KinematicCharacterController = ReturnType<
  ReturnType<typeof useRapier>["world"]["createCharacterController"]
>;

interface Props {
  /** Receives the interpolated visual root; the follow camera tracks it. */
  targetRef: RefObject<Object3D | null>;
  /** Spawn point in local meters (capsule center). */
  spawn: readonly [number, number, number];
}

export function Character({ targetRef, spawn }: Props) {
  const { world } = useRapier();
  const bodyRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const controllerRef = useRef<KinematicCharacterController | null>(null);
  const avatarRef = useRef<Group>(null);
  const [subscribeKeys, getKeys] = useKeyboardControls<Control>();

  // Per-step simulation state (mutable, never triggers renders).
  const sim = useRef({
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: false,
    facing: 0,
    moveSpeed: 0,
    jumpBuffer: 0,
    coyote: 0,
  });

  useDevTestHook(bodyRef, colliderRef);

  // Latch jump on key-down (edge-triggered) instead of polling, so short taps are never missed.
  useEffect(
    () =>
      subscribeKeys(
        (state) => state.jump,
        (pressed) => {
          if (pressed) sim.current.jumpBuffer = CHARACTER.jumpBuffer;
        },
      ),
    [subscribeKeys],
  );

  useEffect(() => {
    const c = world.createCharacterController(0.02);
    c.enableAutostep(CHARACTER.autostepMaxHeight, CHARACTER.autostepMinWidth, true);
    c.enableSnapToGround(CHARACTER.snapToGround);
    c.setMaxSlopeClimbAngle((CHARACTER.maxSlopeClimbDeg * Math.PI) / 180);
    c.setMinSlopeSlideAngle((50 * Math.PI) / 180);
    c.setApplyImpulsesToDynamicBodies(true);
    controllerRef.current = c;
    return () => {
      world.removeCharacterController(c);
      controllerRef.current = null;
    };
  }, [world]);

  useBeforePhysicsStep((w) => {
    const body = bodyRef.current;
    const collider = colliderRef.current;
    const controller = controllerRef.current;
    if (!body || !collider || !controller) return;

    const dt = w.timestep;
    const s = sim.current;
    const keys = getKeys();

    // Camera-relative input. yaw = 0 faces -z (north).
    const fwdX = -Math.sin(look.yaw);
    const fwdZ = -Math.cos(look.yaw);
    const rightX = Math.cos(look.yaw);
    const rightZ = -Math.sin(look.yaw);
    const iz = Number(keys.forward) - Number(keys.backward);
    const ix = Number(keys.right) - Number(keys.left);
    let dx = fwdX * iz + rightX * ix;
    let dz = fwdZ * iz + rightZ * ix;
    const len = Math.hypot(dx, dz);
    if (len > 0) {
      dx /= len;
      dz /= len;
      s.facing = Math.atan2(dx, dz);
    }

    const speed = keys.sprint ? CHARACTER.sprintSpeed : CHARACTER.walkSpeed;
    const blend = 1 - Math.exp(-(s.grounded ? CHARACTER.groundAccel : CHARACTER.airAccel) * dt);
    s.vx += (dx * speed - s.vx) * blend;
    s.vz += (dz * speed - s.vz) * blend;

    s.coyote = s.grounded ? CHARACTER.coyoteTime : s.coyote - dt;
    if (s.grounded && s.vy < 0) s.vy = 0;
    if (s.jumpBuffer > 0 && s.coyote > 0) {
      s.vy = CHARACTER.jumpVelocity;
      s.jumpBuffer = 0;
      s.coyote = 0;
    }
    s.jumpBuffer -= dt;
    s.vy += CHARACTER.gravity * dt;

    const desired = { x: s.vx * dt, y: s.vy * dt, z: s.vz * dt };
    controller.computeColliderMovement(collider, desired);
    const move = controller.computedMovement();
    s.grounded = controller.computedGrounded();

    // Bumped a ceiling while rising: stop upward velocity.
    if (s.vy > 0 && move.y < desired.y * 0.5) s.vy = 0;
    // Blocked horizontally: bleed velocity so we don't "push" into walls forever.
    if (dt > 0) {
      s.vx = move.x / dt;
      s.vz = move.z / dt;
    }
    s.moveSpeed = Math.hypot(s.vx, s.vz);

    const p = body.translation();
    if (p.y < CHARACTER.killY) {
      const [x, y, z] = spawn;
      body.setTranslation({ x, y, z }, true);
      s.vx = s.vy = s.vz = 0;
      return;
    }
    body.setNextKinematicTranslation({ x: p.x + move.x, y: p.y + move.y, z: p.z + move.z });
  });

  // Visual-only: turn toward the movement direction.
  useFrame((_, delta) => {
    const avatar = avatarRef.current;
    if (!avatar) return;
    let diff = sim.current.facing - avatar.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    avatar.rotation.y += diff * (1 - Math.exp(-14 * delta));
  });

  return (
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      colliders={false}
      position={[...spawn]}
      enabledRotations={[false, false, false]}
    >
      <CapsuleCollider ref={colliderRef} args={[CHARACTER.halfHeight, CHARACTER.radius]} />
      <group ref={targetRef}>
        <group ref={avatarRef}>
          <Avatar motion={sim} feetOffset={CENTER_TO_FEET} fullSpeed={CHARACTER.sprintSpeed} />
        </group>
      </group>
    </RigidBody>
  );
}

/**
 * Dev-only handle for automated playtests (window.__polyworld). Stripped from production builds.
 * Lets a headless test aim the player, raycast for walls, and read the position.
 */
function useDevTestHook(
  bodyRef: RefObject<RapierRigidBody | null>,
  colliderRef: RefObject<RapierCollider | null>,
) {
  const { world, rapier } = useRapier();
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const hook = {
      position: () => bodyRef.current?.translation() ?? null,
      setYaw: (yaw: number) => {
        look.yaw = yaw;
      },
      setPitch: (pitch: number) => {
        look.pitch = pitch;
      },
      /** Move the player (capsule center) to local x, z. */
      teleport: (x: number, z: number, y = 1.5) => {
        bodyRef.current?.setTranslation({ x, y, z }, true);
      },
      /** The generated world (furniture positions, stats) for scripted checks. */
      world: () => useGame.getState().world,
      /** First collider along a horizontal direction from the player's chest: distance (m), facing, handle. */
      castRay: (dx: number, dz: number, maxDistance = 200) => {
        const p = bodyRef.current?.translation();
        if (!p) return null;
        const len = Math.hypot(dx, dz);
        const ray = new rapier.Ray({ x: p.x, y: p.y + 0.3, z: p.z }, { x: dx / len, y: 0, z: dz / len });
        const hit = world.castRayAndGetNormal(ray, maxDistance, true, undefined, undefined, colliderRef.current ?? undefined);
        if (!hit) return null;
        // facing < 0: the ray hit the front of a surface; > 0: it hit a back face.
        const facing = (hit.normal.x * dx + hit.normal.z * dz) / len;
        return { distance: hit.timeOfImpact, facing, collider: hit.collider.handle };
      },
    };
    (window as unknown as { __polyworld?: typeof hook }).__polyworld = hook;
    return () => {
      delete (window as unknown as { __polyworld?: typeof hook }).__polyworld;
    };
  }, [world, rapier, bodyRef, colliderRef]);
}
