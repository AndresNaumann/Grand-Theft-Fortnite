import { Suspense, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import type { Object3D } from "three";
import { WORLD } from "./config/world.config";
import { Character } from "./player/Character";
import { FollowCamera } from "./player/FollowCamera";
import { keyMap } from "./player/input";
import { useGame } from "./store";
import { Lights } from "./style/lights";
import { Sky } from "./style/sky";
import { Debug } from "./ui/Debug";
import { HUD } from "./ui/HUD";
import { Loading } from "./ui/Loading";
import { Ground } from "./world/Ground";
import { TestCourse } from "./world/TestCourse";

export function App() {
  const playerRef = useRef<Object3D>(null);
  const debug = useGame((s) => s.debug);

  return (
    <KeyboardControls map={keyMap}>
      <Canvas
        flat // NoToneMapping: palette hexes render as authored (SPEC §7)
        dpr={[1, 2]}
        camera={{ fov: 60, near: 0.1, far: 2000, position: [0, 4, 8] }}
      >
        <Sky />
        <Lights />
        <Suspense fallback={null}>
          {/* Negative priority: physics steps + interpolates before the camera reads positions. */}
          <Physics timeStep={1 / 60} updatePriority={-50} debug={debug}>
            <Ground />
            {WORLD.features.testCourse && <TestCourse />}
            <Character targetRef={playerRef} />
            <PhysicsReady />
          </Physics>
        </Suspense>
        <FollowCamera targetRef={playerRef} />
        <Debug />
      </Canvas>
      <HUD />
      <Loading />
    </KeyboardControls>
  );
}

function PhysicsReady() {
  const setPhysicsReady = useGame((s) => s.setPhysicsReady);
  useEffect(() => {
    setPhysicsReady(true);
    return () => setPhysicsReady(false);
  }, [setPhysicsReady]);
  return null;
}
