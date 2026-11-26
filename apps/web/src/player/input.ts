import type { KeyboardControlsEntry } from "@react-three/drei";

/** Keyboard bindings (SPEC §8.1). */
export const Controls = {
  forward: "forward",
  backward: "backward",
  left: "left",
  right: "right",
  sprint: "sprint",
  jump: "jump",
  interact: "interact",
  reset: "reset",
  debug: "debug",
} as const;
export type Control = (typeof Controls)[keyof typeof Controls];

export const keyMap: KeyboardControlsEntry<Control>[] = [
  { name: Controls.forward, keys: ["KeyW", "ArrowUp"] },
  { name: Controls.backward, keys: ["KeyS", "ArrowDown"] },
  { name: Controls.left, keys: ["KeyA", "ArrowLeft"] },
  { name: Controls.right, keys: ["KeyD", "ArrowRight"] },
  { name: Controls.sprint, keys: ["ShiftLeft", "ShiftRight"] },
  { name: Controls.jump, keys: ["Space"] },
  { name: Controls.interact, keys: ["KeyE"] },
  { name: Controls.reset, keys: ["KeyR"] },
  { name: Controls.debug, keys: ["Backquote"] },
];

/**
 * Mouse-look state, mutated directly by pointer events and read every frame.
 * Kept outside React/zustand on purpose so mouse movement never triggers re-renders.
 * yaw = 0 looks toward -z (north); positive yaw turns left (counter-clockwise from above).
 */
export const look = {
  yaw: 0,
  pitch: 0.25,
};

export const LOOK_SENSITIVITY = 0.0022;
export const PITCH_MIN = -0.35;
export const PITCH_MAX = 1.2;

/** Attach pointer-lock mouse look to a canvas. Returns a cleanup function. */
export function attachMouseLook(
  canvas: HTMLCanvasElement,
  onLockChange: (locked: boolean) => void,
): () => void {
  const onClick = () => {
    if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
  };
  const onMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return;
    look.yaw -= e.movementX * LOOK_SENSITIVITY;
    look.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, look.pitch + e.movementY * LOOK_SENSITIVITY));
  };
  const onLock = () => onLockChange(document.pointerLockElement === canvas);

  canvas.addEventListener("click", onClick);
  document.addEventListener("mousemove", onMove);
  document.addEventListener("pointerlockchange", onLock);
  return () => {
    canvas.removeEventListener("click", onClick);
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("pointerlockchange", onLock);
  };
}
