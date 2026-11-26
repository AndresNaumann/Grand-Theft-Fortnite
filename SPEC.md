# SPEC — Polyworld (working title)

> Build spec and vision for a browser game that turns open map data into a stylized, toy-like, walkable and drivable version of the real world.
> This document is the source of truth for humans and coding agents. If the code and this spec disagree, either fix the code or update this spec in the same PR.

**Status:** Draft v0.1 · **Owner:** Andrew · **Last updated:** 2026-11-26

> **Naming note:** "Polyworld" is a placeholder. Do not use "Fortnite," "GTA," or any Epic/Rockstar names, assets, or trade dress in the repo name, UI, or marketing. "Fortnite-style" is only an internal shorthand for the art direction.

---

## 1. Vision

Pick any place on Earth and drop into a bright, cartoony, fully explorable version of it. The real street grid, real buildings, and real parks are all there, rendered like a toy city. You can walk around it and drive around it.

The long-term version streams the whole planet, uses AI to fill in what the map data doesn't know (building heights, roof shapes, facade styles), and tidies up messy geometry so the result feels hand-built.

**Core bet:** a stylized look is much easier to produce than a photoreal one. OSM tags already tell us what every surface is. If we color by tag, use toon shading, and add outlines, we get a coherent art style without satellite imagery, photogrammetry, or any per-city art work.

## 2. MVP scope

### Goals (MVP)

1. A user opens a URL and is walking around a real neighborhood (about 1.5 km²) generated from OSM data within **5 seconds** on broadband.
2. The neighborhood reads as a stylized toy city: toon-shaded, outlined, saturated palette, with trees and water.
3. The player can **walk** (third person, with collision against buildings) and **drive** (enter and exit a car, arcade handling).
4. Steady **60 fps** on an M1 MacBook Air in Chrome at 1080p.
5. Changing the area is a one-line config change (bbox + origin), and generation is deterministic.

### Non-goals (MVP)

| Out of scope | Why |
|---|---|
| Combat, weapons, NPC pedestrians, traffic, missions | Not needed to prove the core experience. Each is a large system on its own. |
| Building interiors | OSM has no interior data. Huge scope. |
| Whole-planet streaming | Arrives at M6. MVP is a single baked or fetched area. |
| Photoreal imagery and Google 3D Tiles | Conflicts with the art direction. Also brings licensing and cost issues. |
| Multiplayer | Separate initiative. |
| Mobile and touch controls | Desktop only for MVP. |
| Runtime AI (neural rendering, world models) | AI is used at bake time only. See §9. |

## 3. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | |
| Build | Vite | |
| Package manager | pnpm workspaces | Monorepo. See §5. |
| Rendering | Three.js via React Three Fiber (`@react-three/fiber`) + `@react-three/drei` | |
| Physics | Rapier via `@react-three/rapier` | Use the Rapier `KinematicCharacterController` for walking and `DynamicRayCastVehicleController` for driving. |
| Post-processing | `postprocessing` + `@react-three/postprocessing` | Used for the outline/edge pass and the color grade. |
| Geometry utils | `earcut`, `@turf/turf` (selected modules), `three/examples/jsm/utils/BufferGeometryUtils` | |
| OSM parsing | `osmtogeojson` | |
| State / input | `zustand`; `@react-three/drei` KeyboardControls | |
| Tests | Vitest | |
| Bake CLI (M4+) | Node + `@gltf-transform/core`/`functions` | Outputs GLB chunks. |
| Hosting | Any static host (GitHub Pages / Cloudflare Pages) | MVP has no backend. |

Pin exact versions in `package.json` at scaffold time. Do not add a runtime dependency without adding an entry to the Decisions Log (§13).

## 4. Architecture

```mermaid
flowchart LR
  subgraph Sources
    OSM[(OSM via Overpass API)]
    OV[(Overture buildings - M6)]
    DEM[(Terrain tiles - M6)]
  end

  subgraph worldgen["packages/worldgen (pure TS, browser + node)"]
    P[parse: osmtogeojson]
    J[project: lat/lon to local meters]
    R[resolve: heights, widths, styles]
    G[generate: BufferGeometry per layer]
  end

  subgraph enrich["tools/enrich (M5)"]
    AI[LLM tag inference -> enrichment.json]
  end

  subgraph bake["tools/bake (M4)"]
    B[chunk + merge + GLB export + manifest]
  end

  subgraph web["apps/web (R3F client)"]
    L[loader: raw OSM (M1) or GLB chunks (M4)]
    S[scene: toon materials, outlines, sky]
    PH[physics: Rapier colliders]
    PL[player: walk / drive / camera]
  end

  OSM --> P --> J --> R --> G
  AI -. overrides .-> R
  G --> L
  G --> B --> L
  L --> S
  L --> PH --> PL
```

**Key rule:** `packages/worldgen` contains only pure, deterministic functions with no DOM, network, or Three.js renderer dependencies (it may use Three.js math and geometry). The same code runs in the browser for M1–M3, inside a Web Worker, and in Node for the bake step in M4+.

## 5. Repo layout

```
/
├─ SPEC.md                    # this file
├─ README.md                  # quick start, attribution
├─ pnpm-workspace.yaml
├─ apps/
│  └─ web/
│     ├─ index.html
│     └─ src/
│        ├─ main.tsx
│        ├─ App.tsx
│        ├─ config/world.config.ts     # bbox, origin, feature flags
│        ├─ world/                      # loaders, worker bridge, chunk manager (M4)
│        ├─ style/                      # palette.ts, toonMaterial.ts, outline.tsx, sky.tsx
│        ├─ player/                     # Character.tsx, Vehicle.tsx, FollowCamera.tsx, input.ts
│        └─ ui/                         # HUD.tsx, Attribution.tsx, Loading.tsx
├─ packages/
│  └─ worldgen/
│     ├─ src/
│     │  ├─ overpass.ts       # query builder (string only, no fetch)
│     │  ├─ parse.ts          # OSM JSON -> typed features
│     │  ├─ project.ts        # lat/lon <-> local ENU meters
│     │  ├─ resolve/          # height.ts, roadWidth.ts, style.ts
│     │  ├─ mesh/             # buildings.ts, roads.ts, areas.ts, trees.ts, water.ts
│     │  ├─ rng.ts            # seeded RNG keyed by OSM id
│     │  └─ index.ts          # generateWorld(osmJson, config) -> WorldGeometry
│     ├─ fixtures/            # small saved Overpass responses for tests
│     └─ test/
├─ tools/
│  ├─ fetch-area/             # CLI: bbox -> data/<area>.osm.json (Overpass, cached)
│  ├─ bake/                   # M4: CLI: area -> public/chunks/*.glb + manifest.json
│  └─ enrich/                 # M5: CLI: area -> data/<area>.enrichment.json
└─ data/                      # gitignored raw caches
```

## 6. Data pipeline

### 6.1 Area config

```ts
// apps/web/src/config/world.config.ts
export const WORLD = {
  areaId: "boston-back-bay",
  // Overpass bbox order: south, west, north, east
  bbox: [42.344, -71.090, 42.356, -71.070] as const,
  origin: { lat: 42.350, lon: -71.080 }, // local (0,0,0)
  source: "overpass-runtime" as "overpass-runtime" | "local-json" | "baked-chunks",
};
```

### 6.2 Overpass query (built by `overpass.ts`)

```
[out:json][timeout:60];
(
  way["building"]({{bbox}});
  relation["building"]({{bbox}});
  way["building:part"]({{bbox}});
  way["highway"]({{bbox}});
  way["landuse"]({{bbox}});
  way["leisure"~"^(park|garden|pitch|playground)$"]({{bbox}});
  way["natural"~"^(water|wood|scrub|grassland|beach)$"]({{bbox}});
  relation["natural"="water"]({{bbox}});
  way["waterway"~"^(river|canal|stream)$"]({{bbox}});
  node["natural"="tree"]({{bbox}});
);
out body; >; out skel qt;
```

Respect Overpass usage policy. Keep areas small. During development, use `tools/fetch-area` to save responses locally (`source: "local-json"`) instead of hitting Overpass on every reload.

### 6.3 Projection

Use a local tangent-plane (equirectangular) approximation around `origin`. It is accurate to well under 1 m at MVP scale.

```
x =  (lon - lon0) * cos(lat0) * 111_320
z = -(lat - lat0) * 110_540        // Three.js is y-up; north = -z
y = 0                               // flat ground until terrain (M6)
```

Units are meters everywhere. 1 Three.js unit = 1 m.

### 6.4 Building height resolution (`resolve/height.ts`)

First match wins. Clamp the result to [2.5, 300] m.

1. `enrichment.json` override for this OSM id (M5+) **only if** none of the OSM tags in steps 2–3 are present.
2. `height` tag (strip units, parse float).
3. `building:levels` × 3.2 + roof allowance (`roof:levels` × 3.2, or 0).
4. Default by `building` value: `house|detached|semidetached_house` 7 · `apartments|residential` 15 · `commercial|retail|office` 14 · `garage|garages|shed|hut` 3 · `church` 18 · `yes` and anything else → step 5.
5. Seeded random in [6, 14] keyed by OSM id. This keeps results deterministic.

`min_height` / `building:min_level` raise the base. `building:part` is P1. In MVP, if a building has parts, render the parts and skip the outline.

### 6.5 Road widths (`resolve/roadWidth.ts`)

If a `lanes` tag exists, width = `lanes × 3.5`. Otherwise:

| highway | width (m) | drivable |
|---|---|---|
| motorway | 14 | ✓ |
| trunk | 12 | ✓ |
| primary | 10 | ✓ |
| secondary | 9 | ✓ |
| tertiary | 8 | ✓ |
| residential / unclassified / living_street | 6 | ✓ |
| service | 4 | ✓ |
| pedestrian | 5 | ✗ |
| footway / path / cycleway / steps | 2 | ✗ |

### 6.6 Layer stack and z-fighting

Use small y-offsets plus `polygonOffset` on materials. Never rely on y-offsets alone.

| Layer | y (m) | renderOrder |
|---|---|---|
| Ground plane | 0.00 | 0 |
| Landuse / parks / beach | 0.02 | 1 |
| Water | 0.03 | 2 |
| Footways | 0.04 | 3 |
| Roads | 0.05 | 4 |
| Road markings (P1) | 0.06 | 5 |

### 6.7 Geometry generation

- **Buildings:** use earcut on the footprint (outer ring plus holes from multipolygons). Extrude walls to the resolved height, cap with a flat roof (MVP), and use simple pyramidal or gabled roofs for small `house` footprints (P1).
- **Roads:** build a ribbon along the polyline, offset by ±width/2 with mitered joins (clamp the miter at 2× width). Intersections: render a circular cap (disc) at each node shared by 3 or more ways (MVP hack; proper junction polygons are P2).
- **Areas:** triangulate landuse, leisure, natural, and water polygons with earcut.
- **Trees:** use `InstancedMesh` with a low-poly cone or sphere-on-cylinder. Place one at each `natural=tree` node, and use Poisson-disc scatter inside `wood`/`park` polygons at about 1 tree per 80 m², skipping points within 2 m of a road. Apply seeded scale and rotation jitter.
- **Batching:** merge all static geometry per layer per chunk with `mergeGeometries`. Encode per-building variation in **vertex colors** so that one toon material serves each layer. Target ≤ 300 draw calls total.

## 7. Art direction

**Look:** bright, saturated, toy-like, with soft 3-band shading, dark outlines, a clean sky gradient, and no texture noise.

### 7.1 Palette (`style/palette.ts`)

| Role | Hex |
|---|---|
| Grass / ground | `#7ED957` |
| Park | `#5CC24A` |
| Forest canopy | `#3FA34D` |
| Water | `#3FA9F5` |
| Sand / beach | `#F6D48F` |
| Road | `#4A4E5A` |
| Footway | `#D9C7A3` |
| Road marking | `#F5F5F5` |
| Building walls (pick by seeded RNG) | `#F2E8CF` `#F4A261` `#E76F51` `#8ECAE6` `#B5E48C` `#FFD166` `#CDB4DB` |
| Roofs | `#6D597A` `#B56576` `#355070` `#E56B6F` |
| Sky top / horizon | `#4FC3F7` / `#B3E5FC` |
| Outline | `#1B1B2F` |

### 7.2 Shading

- Use `MeshToonMaterial` with a 3-step gradient map: a `DataTexture` with values `[90, 170, 255]` and `NearestFilter`.
- Lights: one directional sun (warm, casting shadows within a 150 m frustum around the player) plus a hemisphere light (sky/ground tints from the palette).
- Shadows: PCF soft, 2048 map, following the player.
- **Windows:** a procedural pattern in the wall shader (P1), computed from world-space UVs (floor height 3.2 m, bay width 3 m). Draw the window panes slightly darker and bluer than the wall color. Do not use texture files.

### 7.3 Outlines

- MVP: a screen-space edge-detection pass on depth and normals (Sobel), drawn in the outline color, with thickness ≈ 1.5 px at 1080p.
- Fallback if the pass costs more than 2 ms: inverted-hull outlines on buildings only.

### 7.4 Atmosphere

- Sky: a gradient sky dome.
- Fog: linear fog matching the horizon color, starting at 250 m and fully opaque at 600 m. This also hides the edge of the area.

## 8. Gameplay

### 8.1 Controls (desktop)

| Action | Walk | Drive |
|---|---|---|
| Move / throttle | WASD | W throttle, S brake/reverse |
| Steer | — | A / D |
| Look | Mouse (pointer lock) | Mouse orbits camera |
| Sprint / handbrake | Shift | Space |
| Jump | Space | — |
| Enter / exit vehicle | E (car within 3 m) | E |
| Reset car upright | — | R |
| Toggle debug overlay | ` | ` |

### 8.2 Character (starting values; tune as needed)

- Rapier `KinematicCharacterController`.
- Capsule: radius 0.35 m, half-height 0.55 m.
- Movement: walk 4.5 m/s, sprint 8 m/s, jump velocity 6 m/s, gravity −20 m/s².
- `autostep`: max height 0.4 m, min width 0.2 m, include dynamic bodies.
- `snapToGround`: 0.5 m. `maxSlopeClimbAngle`: 45°.
- MVP avatar: a stylized capsule-person (body, head, simple bob animation). A rigged model is P1.

### 8.3 Vehicle (starting values; arcade feel over realism)

- Rapier `DynamicRayCastVehicleController`.
- Chassis: cuboid 1.8 × 0.6 × 4.2 m, mass 1200 kg, center of mass lowered 0.3 m.
- Wheels: 4, radius 0.35 m, suspension rest length 0.3 m, stiffness about 30, damping about 4.5, friction slip about 2.5.
- Drive: max engine force about 4000, max brake about 100. Max steer is 0.5 rad at low speed and blends to 0.15 rad at 30 m/s.
- MVP spawns 3 cars on drivable roads near the start. Re-spawn a car that leaves the area or flips for more than 3 s.

### 8.4 Camera

- Third-person follow with smoothed position and look-at.
- Distance: walk 6 m (height 2 m); drive 9 m (height 3 m).
- Collision: raycast from target to camera; if blocked, pull in to the hit point minus 0.3 m.
- On vehicle entry or exit, blend the camera over 300 ms.

### 8.5 Physics colliders

- Ground: one large fixed cuboid.
- Buildings: fixed **trimesh** collider per chunk, built from the merged building geometry (no roof caps needed below 0.5 m).
- Roads and areas: no colliders (ground handles it).
- Trees: optional cylinder colliders for trees within 50 m of the player (P1).
- Area boundary: invisible walls at the bbox edge, inset 5 m.

## 9. AI enrichment (bake-time only)

AI never runs at runtime and never overrides explicit OSM tags. Its job is to fill gaps and make semantic guesses. Geometric cleanup is deterministic code.

### 9.1 Deterministic cleanup (M4, no AI)

- Snap road endpoints within 0.5 m.
- Simplify polylines (Douglas-Peucker, 0.3 m).
- Drop slivers smaller than 4 m².
- Fix self-intersecting footprints (buffer(0)).
- Remove buildings whose footprint is entirely under a road.

### 9.2 LLM tag inference (M5)

- **Input per building:** OSM id, tags, footprint area and perimeter, centroid, and a summary of neighbor tags within 50 m (counts of building types, median known height, landuse).
- **Output (strict JSON, schema-validated):**

```json
{
  "osm_id": "way/123456",
  "height_m": 18.5,
  "roof_shape": "flat | gabled | hipped | pyramidal",
  "facade_style": "brownstone | glass_office | brick_lowrise | wood_house | industrial | civic",
  "wall_color_hint": "#C97B5A",
  "confidence": 0.72
}
```

- **Batching:** batch about 50 buildings per call.
- **Caching:** cache by `osm_id + osm_version` in `data/<area>.enrichment.json`. Commit the file for the demo area so builds are reproducible without API calls.
- **Thresholds:** below confidence 0.4, fall through to the default rules in §6.4.
- **Usage:** `facade_style` selects a palette subset and a window-pattern variant.

### 9.3 Later (P2, research)

- Generate a stylized facade texture atlas with an image model, with a few variants per `facade_style`.
- Explore neural restyling or world-model approaches. These do not block anything above.

## 10. Performance budgets

| Metric | Budget |
|---|---|
| Frame time (M1 Air, Chrome, 1080p) | ≤ 16.6 ms; worldgen must not cause frame drops |
| Draw calls | ≤ 300 |
| Triangles on screen | ≤ 2M |
| Time to playable (1.5 km², broadband, warm Overpass or local JSON) | ≤ 5 s |
| Worldgen for 1.5 km² | ≤ 1.5 s, run in a Web Worker, never on the main thread |
| JS heap | ≤ 500 MB |
| Chunk GLB size (M4) | ≤ 2 MB each after meshopt/Draco |

Expose `r3f-perf` or an equivalent stats overlay behind the debug toggle.

## 11. Milestones and acceptance criteria

Each milestone is one or more PRs. A milestone is done only when every box is checked.

### M0 — Scaffold
- [ ] The pnpm monorepo matches the layout in §5; `pnpm dev` serves `apps/web`.
- [ ] R3F canvas shows a flat ground plane, a sky gradient, and a sun.
- [ ] A capsule character walks with WASD and the follow camera; Rapier ground collision works.
- [ ] Vitest runs in `packages/worldgen` with at least one passing test.
- [ ] CI (GitHub Actions) runs typecheck, lint, and test on PRs.

### M1 — Real city from OSM
- [ ] `tools/fetch-area` saves the configured bbox to `data/<area>.osm.json`.
- [ ] `generateWorld()` produces buildings, roads, areas, water, and trees from the fixture, with unit tests for projection, height resolution, and road width.
- [ ] Worldgen runs in a Web Worker and transfers geometry buffers to the main thread.
- [ ] Buildings have trimesh colliders: given the player walks into a building wall, then the player stops and does not tunnel.
- [ ] Generation is deterministic: the same input produces byte-identical position buffers (test asserts a hash).
- [ ] The "© OpenStreetMap contributors" attribution is always visible.

### M2 — The look
- [ ] Toon materials, palette, outlines, fog, and shadows are implemented per §7.
- [ ] Trees are instanced; draw calls ≤ 300 for the demo area.
- [ ] No visible z-fighting between road, area, and water layers at any camera angle above 5°.
- [ ] Screenshot test: a fixed camera pose renders and is saved as a CI artifact for visual review.

### M3 — Driving
- [ ] Cars spawn on drivable roads; E enters or exits the nearest car within 3 m.
- [ ] Vehicle handling uses the §8.3 defaults; cars cannot leave the area boundary.
- [ ] Camera switches modes with a blend; camera collision prevents clipping through buildings.
- [ ] R resets a flipped car.
- [ ] **MVP complete:** someone who has never seen the project can open the URL, walk, drive, and recognize the real neighborhood.

### M4 — Bake and chunks
- [ ] `tools/bake` outputs 256 m × 256 m GLB chunks plus `manifest.json` (chunk ids, bounds, collider data).
- [ ] The client streams chunks within a 400 m radius and unloads beyond 600 m with no hitch over 50 ms.
- [ ] Deterministic cleanup (§9.1) is applied during bake.

### M5 — AI enrichment
- [ ] `tools/enrich` produces a schema-valid `enrichment.json` for the demo area and is resumable and cached.
- [ ] Explicit OSM tags are never overridden (unit test).
- [ ] At least 3 facade styles are visibly distinct in the render.

### M6 — Anywhere (P2)
- [ ] Protomaps PMTiles vector-tile source replaces Overpass for streaming.
- [ ] Overture building heights are merged where OSM lacks them.
- [ ] Terrain comes from Terrarium DEM tiles.
- [ ] A place-search box lets the player teleport to any city.

## 12. Licensing and attribution

- **OSM data:** ODbL. Show "© OpenStreetMap contributors" with a link in the HUD at all times. Rendered imagery is a "Produced Work" and is fine. If we publish a derived *database* (for example, baked chunks with enriched tags), it must be ODbL share-alike.
- **Overture:** check per-theme licenses before M6. Buildings are mostly ODbL/CDLA.
- **Overpass:** follow the instance's usage policy. Do not hammer the public instance from production clients. Production should serve baked or local data.
- **IP:** no third-party game assets, logos, fonts, or names. All models are procedural or original.

## 13. Decisions log

| # | Date | Decision | Rationale |
|---|---|---|---|
| 1 | 2026-11-26 | Browser-first with Three.js/R3F + Rapier | Fastest MVP; shareable via URL; largest geo ecosystem. Revisit Unreal + Cesium if the native look becomes a goal. |
| 2 | 2026-11-26 | Stylized look from OSM tags; no satellite imagery | Coherent art style at zero art cost; avoids imagery licensing. |
| 3 | 2026-11-26 | AI at bake time only, never overriding OSM tags | Determinism, cost control, reproducible builds. |
| 4 | 2026-11-26 | `packages/worldgen` is pure and shared by client and bake | One code path for runtime (M1) and bake (M4). |

## 14. Open questions

| Question | Owner | Blocking? |
|---|---|---|
| Final name and repo name | Andrew | No |
| Demo area: keep Back Bay or pick another dense, well-tagged area? | Andrew | No (Back Bay default) |
| Arcade vs. semi-sim driving feel | Andrew + whoever tunes M3 | No |
| Which LLM and budget for M5 enrichment | Andrew | Blocks M5 only |
| Public deploy: rely on baked data only, or proxy and cache Overpass? | Eng | Blocks public launch |

## 15. Rules for coding agents

1. Read this spec before starting work. Implement the current milestone only, and do not pull work forward from later milestones.
2. `packages/worldgen` stays pure: no `fetch`, DOM, `window`, or renderer. Randomness comes only from `rng.ts`, seeded by OSM id.
3. Every resolver function (height, width, style) gets unit tests against fixtures. Tests never touch the network.
4. Meters, y-up, north = −z. Do not introduce other unit or axis conventions.
5. Keep layers in the §6.6 order. Fix z-fighting with offsets plus `polygonOffset`, never by moving the camera's near plane.
6. Any new dependency, budget change, or deviation from this spec requires a Decisions Log row in the same PR.
7. A PR is done when its milestone's acceptance criteria are checked, CI is green, and a short screen recording or screenshot is attached for visual changes.
