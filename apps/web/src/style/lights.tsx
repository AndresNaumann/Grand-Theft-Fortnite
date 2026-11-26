import { PALETTE } from "./palette";
import { SUN_DIRECTION } from "./sky";

/**
 * Sun + hemisphere fill (SPEC §7.2). Shadows following the player arrive with the look pass in M2.
 * Intensities assume NoToneMapping (Canvas `flat`) so palette hexes render as authored.
 */
export function Lights() {
  const sun = SUN_DIRECTION.clone().multiplyScalar(100);
  return (
    <>
      <directionalLight position={sun} color={PALETTE.sun} intensity={2.4} />
      <hemisphereLight args={[PALETTE.hemiSky, PALETTE.hemiGround, 2.0]} />
    </>
  );
}
