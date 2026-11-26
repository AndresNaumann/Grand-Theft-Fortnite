import { useGame } from "../store";

/** Full-screen overlay until the physics engine (Rapier WASM) is initialized. */
export function Loading() {
  const ready = useGame((s) => s.physicsReady);
  if (ready) return null;
  return (
    <div className="loading">
      <div className="hud-card">
        <strong>Polyworld</strong>
        <span>Loading…</span>
      </div>
    </div>
  );
}
