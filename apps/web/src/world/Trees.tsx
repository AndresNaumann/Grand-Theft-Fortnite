import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TREE_STRIDE } from "@polyworld/worldgen";
import { PALETTE } from "../style/palette";
import { painted } from "./propGeometry";

/** Low-poly tree models (SPEC §6.7): sphere-on-cylinder (round) and cone (conifer). Origin at the base. */
function makeTreeGeometries(): [BufferGeometry, BufferGeometry] {
  const trunk = painted(new CylinderGeometry(0.16, 0.22, 1.8, 6).translate(0, 0.9, 0), PALETTE.trunk);
  const round = painted(new IcosahedronGeometry(1.5, 0).translate(0, 2.9, 0), PALETTE.park);
  const cone = painted(new ConeGeometry(1.4, 3.6, 7).translate(0, 3.2, 0), PALETTE.forest);
  return [mergeGeometries([trunk, round])!, mergeGeometries([trunk, cone])!];
}

function TreeVariant({ geometry, data, variant }: { geometry: BufferGeometry; data: Float32Array; variant: number }) {
  const ref = useRef<InstancedMesh>(null);
  const count = useMemo(() => {
    let n = 0;
    for (let i = 0; i < data.length; i += TREE_STRIDE) if (data[i + 4] === variant) n++;
    return n;
  }, [data, variant]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const p = new Vector3();
    const s = new Vector3();
    let k = 0;
    for (let i = 0; i < data.length; i += TREE_STRIDE) {
      if (data[i + 4] !== variant) continue;
      const scale = data[i + 2]!;
      p.set(data[i]!, 0, data[i + 1]!);
      q.setFromEuler(e.set(0, data[i + 3]!, 0));
      s.setScalar(scale);
      mesh.setMatrixAt(k++, m.compose(p, q, s));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [data, variant]);

  if (count === 0) return null;
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, count]} frustumCulled={false}>
      <meshLambertMaterial vertexColors flatShading />
    </instancedMesh>
  );
}

/** All trees in two instanced draw calls (SPEC §6.7, M2 budget). */
export function Trees({ data }: { data: Float32Array }) {
  const [round, conifer] = useMemo(makeTreeGeometries, []);
  useEffect(
    () => () => {
      round.dispose();
      conifer.dispose();
    },
    [round, conifer],
  );
  return (
    <>
      <TreeVariant geometry={round} data={data} variant={0} />
      <TreeVariant geometry={conifer} data={data} variant={1} />
    </>
  );
}
