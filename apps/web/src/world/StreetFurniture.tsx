import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  Euler,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
} from "three";
import { PROP_STRIDE, type StreetFurniture as Furniture } from "@polyworld/worldgen";
import {
  bladeGeometry,
  buildBladeAtlas,
  lampBody,
  lampGlobe,
  namePost,
  signalBody,
  signalLamps,
  signBody,
  signFace,
  stopTexture,
  yieldTexture,
} from "./propGeometry";

/** Instanced placement of one model at packed (x, z, rotY) positions. */
function Instances({ geometry, material, data }: { geometry: BufferGeometry; material: Material; data: Float32Array }) {
  const ref = useRef<InstancedMesh>(null);
  const count = data.length / PROP_STRIDE;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const p = new Vector3();
    const one = new Vector3(1, 1, 1);
    for (let i = 0; i < count; i++) {
      p.set(data[i * 3]!, 0, data[i * 3 + 1]!);
      q.setFromEuler(e.set(0, data[i * 3 + 2]!, 0));
      mesh.setMatrixAt(i, m.compose(p, q, one));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [data, count]);
  if (count === 0) return null;
  return <instancedMesh ref={ref} args={[geometry, material, count]} frustumCulled={false} />;
}

/** Dispose GPU resources created in a useMemo when the city unmounts. */
function useDisposable<T extends { dispose(): void }>(items: T[]) {
  useEffect(() => () => items.forEach((i) => i.dispose()), [items]);
}

/** Split signals by approach axis so crossing directions show opposite colors (static, no cycling yet). */
function splitByAxis(data: Float32Array): [Float32Array, Float32Array] {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < data.length; i += PROP_STRIDE) {
    const rot = data[i + 2]!;
    // Approaches within 45° of the x axis are "green", the cross street "red".
    (Math.abs(Math.sin(rot)) > Math.SQRT1_2 ? a : b).push(data[i]!, data[i + 1]!, rot);
  }
  return [new Float32Array(a), new Float32Array(b)];
}

/** Signs, signals, lamps and street-name blades (M1.5). Roughly a dozen draw calls in total. */
export function StreetFurniture({ furniture }: { furniture: Furniture }) {
  const res = useMemo(() => {
    const vc = new MeshLambertMaterial({ vertexColors: true });
    const glow = new MeshBasicMaterial({ vertexColors: true });
    const stopMap = stopTexture();
    const yieldMap = yieldTexture();
    const names = furniture.nameSigns.flatMap((s) => s.blades.map((b) => b.text));
    const atlas = buildBladeAtlas(names);
    const geometries = {
      stopBody: signBody("stop"),
      stopFace: signFace("stop"),
      yieldBody: signBody("yield"),
      yieldFace: signFace("yield"),
      signal: signalBody(),
      lampsGreen: signalLamps("green"),
      lampsRed: signalLamps("red"),
      lamp: lampBody(),
      globe: lampGlobe(),
      post: namePost(),
      blades: bladeGeometry(furniture.nameSigns, atlas),
    };
    const materials = {
      vc,
      glow,
      stopFace: new MeshLambertMaterial({ map: stopMap }),
      yieldFace: new MeshLambertMaterial({ map: yieldMap }),
      blades: new MeshLambertMaterial({ map: atlas.texture }),
    };
    const posts = new Float32Array(furniture.nameSigns.flatMap((s) => [s.x, s.z, 0]));
    const [lightsGreen, lightsRed] = splitByAxis(furniture.trafficLights);
    return { geometries, materials, textures: [stopMap, yieldMap, atlas.texture], posts, lightsGreen, lightsRed };
  }, [furniture]);

  useDisposable(useMemo(() => [...Object.values(res.geometries), ...Object.values(res.materials), ...res.textures], [res]));

  const { geometries: g, materials: m } = res;
  return (
    <>
      <Instances geometry={g.stopBody} material={m.vc} data={furniture.stopSigns} />
      <Instances geometry={g.stopFace} material={m.stopFace} data={furniture.stopSigns} />
      <Instances geometry={g.yieldBody} material={m.vc} data={furniture.yieldSigns} />
      <Instances geometry={g.yieldFace} material={m.yieldFace} data={furniture.yieldSigns} />
      <Instances geometry={g.signal} material={m.vc} data={furniture.trafficLights} />
      <Instances geometry={g.lampsGreen} material={m.glow} data={res.lightsGreen} />
      <Instances geometry={g.lampsRed} material={m.glow} data={res.lightsRed} />
      <Instances geometry={g.lamp} material={m.vc} data={furniture.streetLamps} />
      <Instances geometry={g.globe} material={m.glow} data={furniture.streetLamps} />
      <Instances geometry={g.post} material={m.vc} data={res.posts} />
      {furniture.nameSigns.length > 0 && <mesh geometry={g.blades} material={m.blades} />}
    </>
  );
}
