import { create } from "zustand";

/** Low-frequency game/UI state. Per-frame values (positions, look angles) live in refs, not here. */
interface GameState {
  physicsReady: boolean;
  pointerLocked: boolean;
  debug: boolean;
  mode: "walk" | "drive";
  setPhysicsReady: (v: boolean) => void;
  setPointerLocked: (v: boolean) => void;
  toggleDebug: () => void;
}

export const useGame = create<GameState>()((set) => ({
  physicsReady: false,
  pointerLocked: false,
  debug: false,
  mode: "walk",
  setPhysicsReady: (physicsReady) => set({ physicsReady }),
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  toggleDebug: () => set((s) => ({ debug: !s.debug })),
}));
