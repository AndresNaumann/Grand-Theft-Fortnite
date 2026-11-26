import { useEffect } from "react";
import { Stats, useKeyboardControls } from "@react-three/drei";
import { useGame } from "../store";
import type { Control } from "../player/input";

/** ` toggles the debug overlay: FPS stats here, physics collider wireframes via <Physics debug>. */
export function Debug() {
  const [subscribe] = useKeyboardControls<Control>();
  const debug = useGame((s) => s.debug);
  const toggleDebug = useGame((s) => s.toggleDebug);

  useEffect(
    () =>
      subscribe(
        (state) => state.debug,
        (pressed) => {
          if (pressed) toggleDebug();
        },
      ),
    [subscribe, toggleDebug],
  );

  return debug ? <Stats /> : null;
}
