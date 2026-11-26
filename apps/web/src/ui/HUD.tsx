import { useGame } from "../store";

/** Minimal M0 HUD: click-to-play prompt and control hints. */
export function HUD() {
  const ready = useGame((s) => s.physicsReady);
  const locked = useGame((s) => s.pointerLocked);
  const debug = useGame((s) => s.debug);

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
    </div>
  );
}
