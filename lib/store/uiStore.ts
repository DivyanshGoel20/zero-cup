import { create } from "zustand";

// ============================================================
// UI STORE — ephemeral view-only state, never persisted
// ============================================================

export type GameSpeed = "slow" | "normal" | "fast";
export type ActivePanel = "feed" | "suspicion" | "detectives" | "ledger";

export interface UIState {
  gameSpeed: GameSpeed;
  msPerStep: number; // milliseconds per movement animation tick
  activePanel: ActivePanel;
  isDiceAnimating: boolean;
  isBoardHighlighting: boolean;
  showWinnerReveal: boolean;
}

export interface UIActions {
  setGameSpeed: (speed: GameSpeed) => void;
  setActivePanel: (panel: ActivePanel) => void;
  setDiceAnimating: (v: boolean) => void;
  setBoardHighlighting: (v: boolean) => void;
  setShowWinnerReveal: (v: boolean) => void;
}

const SPEED_MAP: Record<GameSpeed, number> = {
  slow: 500,
  normal: 250,
  fast: 80,
};

export const useUIStore = create<UIState & UIActions>((set) => ({
  gameSpeed: "normal",
  msPerStep: SPEED_MAP.normal,
  activePanel: "feed",
  isDiceAnimating: false,
  isBoardHighlighting: false,
  showWinnerReveal: false,

  setGameSpeed: (speed) =>
    set({ gameSpeed: speed, msPerStep: SPEED_MAP[speed] }),

  setActivePanel: (panel) => set({ activePanel: panel }),

  setDiceAnimating: (v) => set({ isDiceAnimating: v }),

  setBoardHighlighting: (v) => set({ isBoardHighlighting: v }),

  setShowWinnerReveal: (v) => set({ showWinnerReveal: v }),
}));
