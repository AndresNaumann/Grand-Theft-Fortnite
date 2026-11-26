# Polyworld (working title)

A browser game that turns OpenStreetMap data into a stylized, toy-like, walkable and drivable version of the real world.

**[SPEC.md](SPEC.md) is the source of truth.** Read it before making changes.

## Quick start

Requirements: Node ≥ 22.12 (see `.nvmrc`) and pnpm 9 (`npm i -g pnpm@9`).

```sh
pnpm install
pnpm dev          # http://localhost:5173
```

| Command | What it does |
|---|---|
| `pnpm dev` | Serve `apps/web` with hot reload |
| `pnpm build` | Production build of `apps/web` |
| `pnpm typecheck` | `tsc` across all workspaces |
| `pnpm lint` | ESLint across the repo |
| `pnpm test` | Vitest (`packages/worldgen`) |

## Controls

| Action | Key |
|---|---|
| Move | WASD |
| Look | Mouse (click the canvas to lock the pointer) |
| Sprint | Shift |
| Jump | Space |
| Debug overlay (FPS, collider wireframes) | ` |

## Layout

```
apps/web            R3F client
packages/worldgen   pure, deterministic OSM → geometry (runs in browser, worker, and Node)
tools/              fetch-area (M1), bake (M4), enrich (M5)
data/               gitignored raw caches
```

## Status

M0 (scaffold) is complete. See SPEC §11 for the milestones.

## Attribution

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the ODbL. OSM data is used from M1 onward.
