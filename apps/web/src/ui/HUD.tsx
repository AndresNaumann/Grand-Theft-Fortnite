import { useEffect } from "react";
import { useGame } from "../store";
import { Attribution } from "./Attribution";

/** HUD: click-to-play prompt, control hints, debug world info, and the always-on OSM attribution. */
export function HUD() {
  const physicsReady = useGame((s) => s.physicsReady);
  const status = useGame((s) => s.worldStatus);
  const locked = useGame((s) => s.pointerLocked);
  const debug = useGame((s) => s.debug);
  const ready = physicsReady && status === "ready";
  const markPlayable = useGame((s) => s.markPlayable);
  useEffect(() => {
    if (ready) markPlayable();
  }, [ready, markPlayable]);

  return (
    <div className="hud">
      {ready && !locked && (
        <div className="hud-center">
          <div className="hud-card">
            <strong>Click to play</strong>
            <span>Esc releases the mouse</span>
          </div>
        </div>
      )}
      <div className="hud-controls">
        <kbd>WASD</kbd> move · <kbd>Mouse</kbd> look · <kbd>Shift</kbd> sprint · <kbd>Space</kbd> jump ·{" "}
        <kbd>`</kbd> debug{debug ? " (on)" : ""}
      </div>
      {debug && <WorldInfo />}
      <Attribution />
    </div>
  );
}

function WorldInfo() {
  const world = useGame((s) => s.world);
  const timings = useGame((s) => s.worldTimings);
  const playableMs = useGame((s) => s.playableMs);
  if (!world || !timings) return null;
  const s = world.stats;
  return (
    <pre className="hud-debug">
      {[
        `time to playable  ${playableMs?.toFixed(0) ?? "…"} ms`,
        `load OSM          ${timings.loadMs.toFixed(0)} ms`,
        `generateWorld     ${timings.generateMs.toFixed(0)} ms (worker)`,
        `buildings ${s.buildings} + ${s.buildingParts} parts (${s.outlinesSkippedForParts} outlines skipped)`,
        `roads ${s.roads} · footways ${s.footways} · areas ${s.areas} · water ${s.water}`,
        `trees ${s.trees} · triangles ${s.triangles.toLocaleString()}`,
      ].join("\n")}
    </pre>
  );
}
