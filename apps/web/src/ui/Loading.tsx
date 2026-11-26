import { useGame } from "../store";

/** Full-screen overlay until physics (Rapier WASM) and the world (worker) are both ready. */
export function Loading() {
  const physicsReady = useGame((s) => s.physicsReady);
  const status = useGame((s) => s.worldStatus);
  const error = useGame((s) => s.worldError);
  if (physicsReady && status === "ready") return null;
  return (
    <div className="loading">
      <div className="hud-card">
        <strong>Polyworld</strong>
        {status === "error" ? (
          <span className="error">{error}</span>
        ) : (
          <span>{status === "loading" ? "Building the city…" : "Starting physics…"}</span>
        )}
      </div>
    </div>
  );
}
