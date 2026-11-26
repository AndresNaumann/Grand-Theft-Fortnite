import { useEffect, useMemo } from "react";
import { CuboidCollider, RigidBody, TrimeshCollider } from "@react-three/rapier";
import { BufferAttribute, BufferGeometry } from "three";
import { GROUND_LAYERS, type MeshBuffers, type WorldGeometry } from "@polyworld/worldgen";
import { WORLD } from "../config/world.config";
import { Trees } from "./Trees";

function toGeometry(m: MeshBuffers): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(m.positions, 3));
  g.setAttribute("normal", new BufferAttribute(m.normals, 3));
  g.setAttribute("color", new BufferAttribute(m.colors, 3));
  g.setIndex(new BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  return g;
}

function useGeometry(m: MeshBuffers): BufferGeometry {
  const g = useMemo(() => toGeometry(m), [m]);
  useEffect(() => () => g.dispose(), [g]);
  return g;
}

/**
 * One flat ground layer (SPEC §6.6). z-fighting is handled three ways:
 * baked y-offset, polygonOffset, and depthWrite=false with renderOrder so overlaps resolve by draw order.
 */
function GroundLayer({ mesh, layer }: { mesh: MeshBuffers; layer: keyof typeof GROUND_LAYERS }) {
  const geometry = useGeometry(mesh);
  const { renderOrder } = GROUND_LAYERS[layer];
  if (mesh.indices.length === 0) return null;
  return (
    <mesh geometry={geometry} renderOrder={renderOrder}>
      <meshLambertMaterial
        vertexColors
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-renderOrder}
        polygonOffsetUnits={-renderOrder * 4}
      />
    </mesh>
  );
}

function Buildings({ mesh }: { mesh: MeshBuffers }) {
  const geometry = useGeometry(mesh);
  if (mesh.indices.length === 0) return null;
  return (
    <RigidBody type="fixed" colliders={false}>
      {/* SPEC §8.5: one fixed trimesh collider built from the merged building geometry. */}
      <TrimeshCollider args={[mesh.positions, mesh.indices]} />
      <mesh geometry={geometry}>
        <meshLambertMaterial vertexColors />
      </mesh>
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

export function City({ world }: { world: WorldGeometry }) {
  return (
    <>
      <GroundLayer mesh={world.layers.areas} layer="areas" />
      <GroundLayer mesh={world.layers.water} layer="water" />
      <GroundLayer mesh={world.layers.footways} layer="footways" />
      <GroundLayer mesh={world.layers.roads} layer="roads" />
      <Buildings mesh={world.layers.buildings} />
      <Trees data={world.trees} />
      <Boundary world={world} />
    </>
  );
}
