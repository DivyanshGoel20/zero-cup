"use client";

import { motion } from "framer-motion";

interface DetectivePawnProps {
  color: string;
  name: string;
  isActive: boolean;
  isEliminated: boolean;
  /** Stacking index when multiple pawns share a cell */
  stackIndex: number;
}

export function DetectivePawn({
  color,
  name,
  isActive,
  isEliminated,
  stackIndex,
}: DetectivePawnProps) {
  const offset = stackIndex * 3;

  return (
    <motion.div
      layout
      initial={{ scale: 0, opacity: 0 }}
      animate={{
        scale: isEliminated ? 0.55 : 1,
        opacity: isEliminated ? 0.35 : 1,
      }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      className="absolute flex items-center justify-center rounded-full shadow-lg pointer-events-none select-none"
      style={{
        width: "clamp(10px, 1.4vw, 20px)",
        height: "clamp(10px, 1.4vw, 20px)",
        backgroundColor: color,
        border: isActive
          ? `2px solid #fff`
          : `1.5px solid rgba(255,255,255,0.25)`,
        boxShadow: isActive
          ? `0 0 8px 2px ${color}88, 0 2px 6px rgba(0,0,0,0.6)`
          : `0 2px 4px rgba(0,0,0,0.5)`,
        zIndex: isActive ? 20 : 10 + stackIndex,
        transform: `translate(${offset}px, ${offset}px)`,
      }}
      title={name}
    >
      {isActive && (
        <motion.div
          className="absolute rounded-full"
          style={{
            width: "140%",
            height: "140%",
            border: `1.5px solid ${color}`,
            opacity: 0.6,
          }}
          animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </motion.div>
  );
}
