import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BackSide, Color, ShaderMaterial, Vector3, type Mesh } from "three";
import { PALETTE } from "./palette";

/** Direction *toward* the sun (normalized). Shared by the sky disc and the directional light. */
export const SUN_DIRECTION = new Vector3(0.45, 0.75, 0.35).normalize();

const SKY_RADIUS = 900;

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    float h = max(dir.y, 0.0);
    vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
    float d = max(dot(dir, uSunDir), 0.0);
    col += uSunColor * pow(d, 48.0) * 0.25;                 // soft glow
    col = mix(col, uSunColor, smoothstep(0.9985, 0.9992, d)); // crisp toy sun disc
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Gradient sky dome (SPEC §7.4). Follows the camera so it never clips. */
export function Sky() {
  const ref = useRef<Mesh>(null);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: BackSide,
        depthWrite: false,
        uniforms: {
          uTop: { value: new Color(PALETTE.skyTop) },
          uHorizon: { value: new Color(PALETTE.skyHorizon) },
          uSunColor: { value: new Color("#FFF8E1") },
          uSunDir: { value: SUN_DIRECTION },
        },
      }),
    [],
  );

  useFrame(({ camera }) => {
    ref.current?.position.copy(camera.position);
  });

  return (
    <mesh ref={ref} material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[SKY_RADIUS, 32, 16]} />
    </mesh>
  );
}
