import { create } from "zustand";
import type { WorldGeometry } from "@polyworld/worldgen";
import type { WorldTimings } from "./world/protocol";

export type WorldStatus = "loading" | "ready" | "error";

/** Low-frequency game/UI state. Per-frame values (positions, look angles) live in refs, not here. */
interface GameState {
  physicsReady: boolean;
  pointerLocked: boolean;
  debug: boolean;
  mode: "walk" | "drive";
  worldStatus: WorldStatus;
  worldError: string | null;
  world: WorldGeometry | null;
  worldTimings: WorldTimings | null;
  /** performance.now() when the page started loading the world, for time-to-playable. */
  loadStartedAt: number;
  /** ms from load start until physics + world were both ready. */
  playableMs: number | null;
  setPhysicsReady: (v: boolean) => void;
  setPointerLocked: (v: boolean) => void;
  toggleDebug: () => void;
  setWorld: (world: WorldGeometry, timings: WorldTimings) => void;
  setWorldError: (message: string) => void;
  markPlayable: () => void;
}

export const useGame = create<GameState>()((set) => ({
  physicsReady: false,
  pointerLocked: false,
  debug: false,
  mode: "walk",
  worldStatus: "loading",
  worldError: null,
  world: null,
  worldTimings: null,
  loadStartedAt: performance.now(),
  playableMs: null,
  setPhysicsReady: (physicsReady) => set({ physicsReady }),
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  toggleDebug: () => set((s) => ({ debug: !s.debug })),
  setWorld: (world, worldTimings) => set({ world, worldTimings, worldStatus: "ready", worldError: null }),
  setWorldError: (worldError) => set({ worldError, worldStatus: "error" }),
  markPlayable: () => set((s) => (s.playableMs === null ? { playableMs: performance.now() - s.loadStartedAt } : s)),
}));
