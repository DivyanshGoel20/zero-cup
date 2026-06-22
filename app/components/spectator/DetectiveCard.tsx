"use client";

import { motion } from "framer-motion";
import type { DetectiveState, DeductionNotebook } from "@/lib/game/types";
import { DETECTIVE_BY_ID } from "@/lib/game/constants";

interface DetectiveCardProps {
  detective: DetectiveState;
  isActive: boolean;
  notebook?: DeductionNotebook;
  confidence: number;
}

export function DetectiveCard({
  detective,
  isActive,
  notebook,
  confidence,
}: DetectiveCardProps) {
  const meta = DETECTIVE_BY_ID[detective.id];

  // Count eliminated cards in their notebook
  const getEliminationStats = () => {
    if (!notebook) return { eliminated: 0, total: 20 }; // 5 suspects + 6 weapons + 9 rooms
    let eliminatedCount = 0;
    
    Object.values(notebook.suspects).forEach((status) => {
      if (status === "ELIMINATED" || status === "HELD_BY_OTHER" || status === "HELD_BY_ME") eliminatedCount++;
    });
    Object.values(notebook.weapons).forEach((status) => {
      if (status === "ELIMINATED" || status === "HELD_BY_OTHER" || status === "HELD_BY_ME") eliminatedCount++;
    });
    Object.values(notebook.rooms).forEach((status) => {
      if (status === "ELIMINATED" || status === "HELD_BY_OTHER" || status === "HELD_BY_ME") eliminatedCount++;
    });

    return { eliminated: eliminatedCount, total: 20 };
  };

  const stats = getEliminationStats();
  const pct = Math.round(confidence * 100);

  return (
    <motion.div
      whileHover={{ y: detective.eliminated ? 0 : -2 }}
      className={`relative p-4 rounded-xl transition-all duration-300 border ${
        detective.eliminated
          ? "bg-black/40 border-white/5 opacity-50"
          : isActive
          ? "bg-[#111827]/90 border-[#b89255] shadow-[0_0_15px_rgba(184,146,85,0.15)]"
          : "bg-[#0d1117]/80 border-white/5 hover:border-white/10"
      }`}
    >
      {/* Active turn badge */}
      {isActive && !detective.eliminated && (
        <span className="absolute top-3 right-3 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#b89255] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#b89255]"></span>
        </span>
      )}

      {/* Detective Header */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg shadow-inner shrink-0"
          style={{
            background: `linear-gradient(135deg, ${detective.color}44 0%, ${detective.color}22 100%)`,
            border: `1px solid ${detective.color}66`,
            color: detective.color,
          }}
        >
          {detective.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <h4
            className="text-sm font-bold truncate transition-colors"
            style={{ color: isActive ? detective.color : "#f1f5f9" }}
          >
            {detective.name}
          </h4>
          <span className="text-[10px] text-[#94a3b8] block truncate font-mono">
            {meta?.personality ? meta.personality : "Rival investigator"}
          </span>
        </div>
      </div>

      {/* Body Details */}
      <div className="mt-3.5 space-y-2 border-t border-white/5 pt-3 text-[11px] font-mono text-[#94a3b8]">
        {/* Status & Location */}
        <div className="flex justify-between items-center">
          <span>Location</span>
          <span className="text-[#f1f5f9] font-medium">
            {detective.eliminated ? (
              <span className="text-red-500 font-semibold">ELIMINATED</span>
            ) : detective.currentRoom ? (
              detective.currentRoom.replace(/_/g, " ")
            ) : (
              `Hallway (${detective.position.x}, ${detective.position.y})`
            )}
          </span>
        </div>

        {/* Hand Cards count */}
        <div className="flex justify-between items-center">
          <span>Hand size</span>
          <span className="text-[#f1f5f9] font-semibold">{detective.cards.length} cards</span>
        </div>

        {/* Clues solved */}
        <div className="flex justify-between items-center">
          <span>Notebook progress</span>
          <span className="text-[#f1f5f9]">
            {stats.eliminated} / {stats.total} clues
          </span>
        </div>

        {/* Evolving confidence */}
        <div className="flex justify-between items-center">
          <span>Confidence</span>
          <span
            className="font-bold"
            style={{ color: detective.eliminated ? "#64748b" : detective.color }}
          >
            {pct}%
          </span>
        </div>

        {/* Public key mock-up / slice */}
        <div className="flex justify-between items-center text-[10px] opacity-75">
          <span>Public Key</span>
          <span className="text-[#06b6d4] max-w-[120px] truncate select-none cursor-help" title={detective.publicKey || "Generating key pair..."}>
            {detective.publicKey ? `${detective.publicKey.substring(0, 10)}...` : "pending_gen"}
          </span>
        </div>
      </div>

      {/* Confidence progress bar */}
      {!detective.eliminated && (
        <div className="mt-3 h-1 w-full rounded-full bg-white/[0.04] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              backgroundColor: detective.color,
              width: `${pct}%`,
            }}
          />
        </div>
      )}
    </motion.div>
  );
}
