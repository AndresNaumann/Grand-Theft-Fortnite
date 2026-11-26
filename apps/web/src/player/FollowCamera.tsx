import { useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Object3D } from "three";
import { useGame } from "../store";
import { attachMouseLook, look } from "./input";

/** Camera tuning (SPEC §8.4). Collision and walk/drive blending arrive in M3. */
export const CAMERA = {
  walk: { distance: 6, height: 2 },
  /** Pivot smoothing rate (1/s). */
  followRate: 12,
  minCameraY: 0.3,
} as const;

interface Props {
  targetRef: RefObject<Object3D | null>;
}

/** Third-person orbit camera around the player, driven by pointer-lock mouse look. */
export function FollowCamera({ targetRef }: Props) {
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  const setPointerLocked = useGame((s) => s.setPointerLocked);

  const pivot = useRef(new Vector3());
  const initialized = useRef(false);
  const tmp = useRef(new Vector3());

  useEffect(() => attachMouseLook(canvas, setPointerLocked), [canvas, setPointerLocked]);

  useFrame((_, delta) => {
    const target = targetRef.current;
    if (!target) return;

    // Pivot sits at the configured height above the player's feet (capsule center is 0.9 m up).
    const desired = target.getWorldPosition(tmp.current);
    desired.y += CAMERA.walk.height - 0.9;

    if (!initialized.current) {
      pivot.current.copy(desired);
      initialized.current = true;
    } else {
      pivot.current.lerp(desired, 1 - Math.exp(-CAMERA.followRate * delta));
    }

    // Orbit: behind the look direction (yaw 0 looks toward -z, so "behind" is +z).
    const { distance } = CAMERA.walk;
    const cp = Math.cos(look.pitch);
    camera.position.set(
      pivot.current.x + Math.sin(look.yaw) * cp * distance,
      Math.max(CAMERA.minCameraY, pivot.current.y + Math.sin(look.pitch) * distance),
      pivot.current.z + Math.cos(look.yaw) * cp * distance,
    );
    camera.lookAt(pivot.current);
  });

  return null;
}
