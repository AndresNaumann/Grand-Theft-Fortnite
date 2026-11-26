import { Suspense, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import type { Object3D } from "three";
import { Character } from "./player/Character";
import { FollowCamera } from "./player/FollowCamera";
import { keyMap } from "./player/input";
import { useGame } from "./store";
import { Lights } from "./style/lights";
import { Sky } from "./style/sky";
import { Debug } from "./ui/Debug";
import { HUD } from "./ui/HUD";
import { Loading } from "./ui/Loading";
import { City } from "./world/City";
import { Ground } from "./world/Ground";
import { loadWorld } from "./world/loadWorld";

export function App() {
  const playerRef = useRef<Object3D>(null);
  const debug = useGame((s) => s.debug);
  const world = useGame((s) => s.world);
  useWorldLoader();

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
            {world && (
              <>
                <City world={world} />
                <Character targetRef={playerRef} spawn={world.spawn} />
              </>
            )}
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

/** Kick off worldgen in a Web Worker as soon as the app mounts (in parallel with Rapier's WASM init). */
function useWorldLoader() {
  const setWorld = useGame((s) => s.setWorld);
  const setWorldError = useGame((s) => s.setWorldError);
  useEffect(() => {
    const { promise, cancel } = loadWorld();
    let cancelled = false;
    promise.then(
      ({ world, timings }) => !cancelled && setWorld(world, timings),
      (err: Error) => !cancelled && setWorldError(err.message),
    );
    return () => {
      cancelled = true;
      cancel();
    };
  }, [setWorld, setWorldError]);
}

function PhysicsReady() {
  const setPhysicsReady = useGame((s) => s.setPhysicsReady);
  useEffect(() => {
    setPhysicsReady(true);
    return () => setPhysicsReady(false);
  }, [setPhysicsReady]);
  return null;
}
