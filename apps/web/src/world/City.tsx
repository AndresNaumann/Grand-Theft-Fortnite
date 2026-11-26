import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody, TrimeshCollider } from "@react-three/rapier";
import { BufferAttribute, BufferGeometry, MeshLambertMaterial, type Material } from "three";
import { GROUND_LAYERS, type MeshBuffers, type WorldGeometry } from "@polyworld/worldgen";
import { WORLD } from "../config/world.config";
import { detailTime, makeDetailMaterial, type DetailKind } from "../style/detailMaterial";
import { StreetFurniture } from "./StreetFurniture";
import { Trees } from "./Trees";

function toGeometry(m: MeshBuffers): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(m.positions, 3));
  g.setAttribute("normal", new BufferAttribute(m.normals, 3));
  g.setAttribute("color", new BufferAttribute(m.colors, 3));
  g.setAttribute("uv", new BufferAttribute(m.uvs, 2));
  g.setIndex(new BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  return g;
}

function useGeometry(m: MeshBuffers): BufferGeometry {
  const g = useMemo(() => toGeometry(m), [m]);
  useEffect(() => () => g.dispose(), [g]);
  return g;
}

function useMaterial(make: () => Material, deps: unknown[]): Material {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const m = useMemo(make, deps);
  useEffect(() => () => m.dispose(), [m]);
  return m;
}

/**
 * One flat ground layer (SPEC §6.6). z-fighting is handled three ways:
 * baked y-offset, polygonOffset, and depthWrite=false with renderOrder so overlaps resolve by draw order.
 */
function GroundLayer({ mesh, layer, detail }: { mesh: MeshBuffers; layer: keyof typeof GROUND_LAYERS; detail?: DetailKind }) {
  const geometry = useGeometry(mesh);
  const { renderOrder } = GROUND_LAYERS[layer];
  const material = useMaterial(() => {
    const params = {
      vertexColors: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -renderOrder,
      polygonOffsetUnits: -renderOrder * 4,
    };
    return detail ? makeDetailMaterial(detail, params) : new MeshLambertMaterial(params);
  }, [detail, renderOrder]);
  if (mesh.indices.length === 0) return null;
  return <mesh geometry={geometry} material={material} renderOrder={renderOrder} />;
}

/** Solid layer with its own fixed trimesh collider (SPEC §8.5): buildings, raised sidewalks. */
function SolidLayer({ mesh, detail }: { mesh: MeshBuffers; detail: DetailKind }) {
  const geometry = useGeometry(mesh);
  const material = useMaterial(() => makeDetailMaterial(detail, { vertexColors: true }), [detail]);
  if (mesh.indices.length === 0) return null;
  return (
    <RigidBody type="fixed" colliders={false}>
      <TrimeshCollider args={[mesh.positions, mesh.indices]} />
      <mesh geometry={geometry} material={material} />
    </RigidBody>
  );
}

/** Invisible walls at the bbox edge, inset 5 m (SPEC §8.5). */
function Boundary({ world }: { world: WorldGeometry }) {
  const { minX, maxX, minZ, maxZ } = world.bounds;
  const i = WORLD.boundaryInset;
  const h = 50;
  const t = 1;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const hx = (maxX - minX) / 2 - i;
  const hz = (maxZ - minZ) / 2 - i;
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[t, h, hz + t]} position={[cx - hx - t, h, cz]} />
      <CuboidCollider args={[t, h, hz + t]} position={[cx + hx + t, h, cz]} />
      <CuboidCollider args={[hx + t, h, t]} position={[cx, h, cz - hz - t]} />
      <CuboidCollider args={[hx + t, h, t]} position={[cx, h, cz + hz + t]} />
    </RigidBody>
  );
}

/** Advances the shared shader clock (water shimmer). */
function DetailClock() {
  useFrame((_, delta) => {
    detailTime.value += delta;
  });
  return null;
}

export function City({ world }: { world: WorldGeometry }) {
  return (
    <>
      <DetailClock />
      <GroundLayer mesh={world.layers.areas} layer="areas" detail="grass" />
      <GroundLayer mesh={world.layers.water} layer="water" detail="water" />
      <GroundLayer mesh={world.layers.footways} layer="footways" detail="paving" />
      <GroundLayer mesh={world.layers.roads} layer="roads" detail="asphalt" />
      <GroundLayer mesh={world.layers.markings} layer="markings" />
      <SolidLayer mesh={world.layers.sidewalks} detail="paving" />
      <SolidLayer mesh={world.layers.buildings} detail="building" />
      <Trees data={world.trees} />
      <StreetFurniture furniture={world.furniture} />
      <Boundary world={world} />
    </>
  );
}
