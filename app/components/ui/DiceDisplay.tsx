"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { GameSpeed } from "@/lib/store/uiStore";

interface DiceDisplayProps {
  value: number | null;
  isAnimating: boolean;
  onRoll: () => void;
  disabled: boolean;
  speed: GameSpeed;
}

const DICE_FACE: Record<number, string> = {
  1: "⚀",
  2: "⚁",
  3: "⚂",
  4: "⚃",
  5: "⚄",
  6: "⚅",
};

export function DiceDisplay({ value, isAnimating, onRoll, disabled, speed }: DiceDisplayProps) {
  const speedLabel: Record<GameSpeed, string> = {
    slow: "Slow",
    normal: "Normal",
    fast: "Fast",
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Dice face */}
      <div className="relative flex items-center justify-center w-16 h-16">
        <div
          className="absolute inset-0 rounded-xl"
          style={{
            background: "linear-gradient(135deg, #1a1208 0%, #2a1a0a 100%)",
            border: "2px solid #3d2b0e",
            boxShadow: "0 4px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(184,146,85,0.2)",
          }}
        />
        <AnimatePresence mode="popLayout">
          {isAnimating ? (
            <motion.div
              key="spinning"
              className="relative z-10 text-4xl"
              animate={{ rotateY: [0, 180, 360], scale: [1, 0.8, 1] }}
              transition={{ duration: 0.4, repeat: Infinity, ease: "linear" }}
            >
              {DICE_FACE[Math.ceil(Math.random() * 6)]}
            </motion.div>
          ) : (
            <motion.div
              key={`val-${value}`}
              className="relative z-10 text-4xl"
              initial={{ rotateY: 90, scale: 0.5 }}
              animate={{ rotateY: 0, scale: 1 }}
              exit={{ rotateY: -90, scale: 0.5 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              {value !== null ? DICE_FACE[value] : "⬜"}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Roll result label */}
      <div className="text-xs font-mono text-[#94a3b8]">
        {value !== null && !isAnimating ? (
          <span className="text-[#b89255] font-bold">Rolled {value}</span>
        ) : (
          <span>Awaiting roll…</span>
        )}
      </div>

      {/* Roll button */}
      <motion.button
        id="btn-roll-dice"
        onClick={onRoll}
        disabled={disabled}
        whileTap={{ scale: disabled ? 1 : 0.93 }}
        whileHover={{ scale: disabled ? 1 : 1.04 }}
        className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: disabled
            ? "rgba(255,255,255,0.05)"
            : "linear-gradient(135deg, #b89255, #8a6a30)",
          color: disabled ? "#475569" : "#000",
          border: "1px solid rgba(184,146,85,0.3)",
          boxShadow: disabled ? "none" : "0 2px 8px rgba(184,146,85,0.3)",
        }}
      >
        Roll Dice
      </motion.button>
    </div>
  );
}
