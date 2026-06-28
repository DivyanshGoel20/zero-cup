"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DetectiveState, DeductionNotebook, DetectiveId, WeaponId, RoomId } from "@/lib/game/types";
import { DETECTIVE_BY_ID, WEAPON_BY_ID } from "@/lib/game/constants";
import { ConspiracyWeb } from "./ConspiracyWeb";

const getCardDetails = (id: string) => {
  const cleanId = id.toUpperCase();
  if (DETECTIVE_BY_ID[cleanId]) {
    return {
      type: "SUSPECT",
      icon: "👤",
      color: "text-[#a78bfa] border-[#a78bfa]/20",
      image: `/detective_${cleanId.toLowerCase()}.png`
    };
  }
  if (WEAPON_BY_ID[cleanId]) {
    let suffix = cleanId.toLowerCase();
    if (suffix.includes("pistol")) suffix = "pistol";
    else if (suffix.includes("opener")) suffix = "opener";
    else if (suffix.includes("strychnine")) suffix = "strychnine";
    else if (suffix.includes("clock")) suffix = "clock";
    else if (suffix.includes("tie")) suffix = "tie";
    else if (suffix.includes("cane")) suffix = "cane";

    return {
      type: "WEAPON",
      icon: "🗡️",
      color: "text-[#f59e0b] border-[#f59e0b]/20",
      image: `/weapon_${suffix}.png`
    };
  }
  const ROOM_IDS = [
    "BILLIARD_ROOM",
    "CONSERVATORY",
    "LIBRARY",
    "WINE_CELLAR",
    "GRAND_FOYER",
    "MASTER_BEDROOM",
    "KITCHEN",
    "DINING_HALL",
    "SECRET_STUDY"
  ];
  if (ROOM_IDS.includes(cleanId)) {
    return {
      type: "ROOM",
      icon: "🚪",
      color: "text-[#06b6d4] border-[#06b6d4]/20",
      image: `/room_${cleanId.toLowerCase()}.png`
    };
  }
  return {
    type: "ROOM",
    icon: "🚪",
    color: "text-[#06b6d4] border-[#06b6d4]/20",
    image: "/room_card_bg.png"
  };
};

const getStatusDetails = (status: string) => {
  switch (status) {
    case "HELD_BY_ME":
      return { label: "Me", color: "bg-green-500/10 text-green-400 border-green-500/20", icon: "🎴" };
    case "HELD_BY_OTHER":
      return { label: "Rival", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: "🕵️" };
    case "ELIMINATED":
      return { label: "Out", color: "bg-red-500/10 text-red-400 border-red-500/20", icon: "❌" };
    default:
      return { label: "Lead", color: "bg-amber-500/5 text-[#b89255] border-amber-500/10", icon: "❓" };
  }
};

interface DetectiveCardProps {
  detective: DetectiveState;
  isActive: boolean;
  notebook?: DeductionNotebook;
  confidence: number;
  humanDetectiveId?: DetectiveId | null;
}

export function DetectiveCard({
  detective,
  isActive,
  notebook,
  confidence,
  humanDetectiveId = null,
}: DetectiveCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const meta = DETECTIVE_BY_ID[detective.id];

  const showCaseFileButton = humanDetectiveId === null;

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

        {/* Behavior Style */}
        <div className="flex justify-between items-center">
          <span>Behavior Style</span>
          <span
            className="text-[9px] font-bold font-mono px-2 py-0.5 rounded border uppercase tracking-wider shrink-0"
            style={{
              backgroundColor: `${detective.color}15`,
              color: detective.color,
              borderColor: `${detective.color}35`,
            }}
          >
            {detective.id === "VANCE" && "Cautious Analyst"}
            {detective.id === "ROSEWOOD" && "Aggressive Risk-taker"}
            {detective.id === "BLACKWOOD" && "Probabilistic Reasoner"}
            {detective.id === "STERLING" && "Blunt Interrogator"}
            {detective.id === "ASHCROFT" && "Cunning Deceiver"}
          </span>
        </div>

        {/* Hand Cards count */}
        <div className="flex justify-between items-center">
          <span>Hand size</span>
          <span className="text-[#f1f5f9] font-semibold">{detective.cards.length} cards</span>
        </div>

        {/* Clues solved */}
        {!(humanDetectiveId && detective.id !== humanDetectiveId) && (
          <div className="flex justify-between items-center">
            <span>Notebook progress</span>
            <span className="text-[#f1f5f9]">
              {stats.eliminated} / {stats.total} clues
            </span>
          </div>
        )}

        {/* Public key scrollable block */}
        <div className="flex flex-col gap-1 text-[9px] opacity-75 mt-1.5 border-t border-white/[0.03] pt-1.5">
          <span className="text-[#64748b]">Public Key (RSA-OAEP JWK)</span>
          <code className="text-[#06b6d4] bg-black/40 px-2 py-1 rounded font-mono break-all text-[8px] max-h-[48px] overflow-y-auto block select-all scrollbar-thin">
            {detective.publicKey || "Generating key pair..."}
          </code>
        </div>
      </div>

      {/* Toggle View Case File Button */}
      {showCaseFileButton && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full mt-3 py-1 bg-white/[0.03] border border-white/5 hover:border-[#b89255]/40 hover:bg-[#b89255]/5 rounded-lg text-[9px] font-bold font-mono text-[#cbd5e1] transition-all cursor-pointer text-center block"
        >
          {isExpanded ? "Collapse Case File" : "Open Detective Case File"}
        </button>
      )}

      {/* Expandable Clues Details */}
      <AnimatePresence>
        {showCaseFileButton && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-3 pt-3 border-t border-white/5 text-[9px] space-y-4"
          >
            {/* Hand Cards */}
            <div>
              <h5 className="font-bold text-[#b89255] uppercase tracking-wider mb-2.5 font-mono text-[9px] flex items-center gap-1.5">
                <span>🎴</span> Secret Hand Cards
              </h5>
              <div className="flex flex-wrap gap-2.5 pt-0.5">
                {detective.cards.map((card) => {
                  const details = getCardDetails(card.id);
                  return (
                    <motion.div
                      key={card.id}
                      whileHover={{ y: -4, scale: 1.05 }}
                      className="w-24 h-36 rounded-xl border relative flex flex-col justify-between p-2.5 shadow-xl bg-slate-950 overflow-hidden shrink-0 group"
                      style={{ borderColor: details.type === "SUSPECT" ? "rgba(167,139,250,0.35)" : details.type === "WEAPON" ? "rgba(245,158,11,0.35)" : "rgba(6,182,212,0.35)" }}
                    >
                      {/* Fullscreen Card Artwork */}
                      <div
                        className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-85 transition-transform duration-300 group-hover:scale-110"
                        style={{ backgroundImage: `url(${details.image})` }}
                      />
                      {/* Dark gradient overlay for top and bottom text readability */}
                      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90 pointer-events-none z-10" />

                      {/* Top banner / icon */}
                      <div className={`flex items-center justify-between text-[9px] font-mono font-bold uppercase tracking-wider z-20 ${
                        details.type === "SUSPECT" ? "text-[#a78bfa]" : details.type === "WEAPON" ? "text-[#f59e0b]" : "text-[#06b6d4]"
                      }`}>
                        <span className="tracking-wide">{details.type}</span>
                        <span>{details.icon}</span>
                      </div>
                      
                      {/* Empty middle spacer */}
                      <div className="flex-1" />
                      
                      {/* Card name */}
                      <div className="text-[10px] font-serif font-black uppercase text-center leading-tight tracking-wider text-white border-t border-white/10 pt-1.5 z-20 w-full px-0.5 break-words">
                        {card.name.replace(/_/g, " ")}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Notebook Checklist (Preserved/Commented Out as requested) */}
            {/*
            notebook && (
              <div>
                <h5 className="font-bold text-[#b89255] uppercase tracking-wider mb-2 font-mono text-[9px] flex items-center gap-1.5">
                  <span>📝</span> Deduction Checklist
                </h5>
                <div className="grid grid-cols-3 gap-2 font-mono">
                  <div className="space-y-1 bg-black/35 p-2 rounded-xl border border-white/[0.03]">
                    <div className="font-bold text-[#a78bfa] border-b border-white/5 pb-1 mb-1.5 uppercase text-[8px] tracking-wider">Suspects</div>
                    {Object.keys(notebook.suspects).map((id) => {
                      const status = notebook.suspects[id as DetectiveId];
                      const name = DETECTIVE_BY_ID[id as DetectiveId]?.name.split(" ").slice(-1)[0] || id;
                      const isCrossed = status !== "POSSIBLE";
                      const details = getStatusDetails(status);
                      return (
                        <div
                          key={id}
                          className={`flex items-center justify-between text-[9px] p-0.5 rounded border border-transparent hover:bg-white/[0.01] transition-colors ${
                            isCrossed ? "opacity-50 italic" : "text-[#cbd5e1] font-semibold"
                          }`}
                        >
                          <span className={`truncate max-w-[55px] ${isCrossed ? "line-through text-white/30" : "text-[#f1f5f9]"}`} title={name}>
                            {name}
                          </span>
                          <span className={`px-1 py-0.2 rounded text-[6.5px] font-mono font-bold border ${details.color} shrink-0`}>
                            {details.icon}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-1 bg-black/35 p-2 rounded-xl border border-white/[0.03]">
                    <div className="font-bold text-[#f59e0b] border-b border-white/5 pb-1 mb-1.5 uppercase text-[8px] tracking-wider">Weapons</div>
                    {Object.keys(notebook.weapons).map((id) => {
                      const status = notebook.weapons[id as WeaponId];
                      const name = id.replace(/_/g, " ").toLowerCase();
                      const isCrossed = status !== "POSSIBLE";
                      const details = getStatusDetails(status);
                      return (
                        <div
                          key={id}
                          className={`flex items-center justify-between text-[9px] p-0.5 rounded border border-transparent hover:bg-white/[0.01] transition-colors capitalize ${
                            isCrossed ? "opacity-50 italic" : "text-[#cbd5e1] font-semibold"
                          }`}
                        >
                          <span className={`truncate max-w-[55px] ${isCrossed ? "line-through text-white/30" : "text-[#f1f5f9]"}`} title={name}>
                            {name}
                          </span>
                          <span className={`px-1 py-0.2 rounded text-[6.5px] font-mono font-bold border ${details.color} shrink-0`}>
                            {details.icon}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-1 bg-black/35 p-2 rounded-xl border border-white/[0.03]">
                    <div className="font-bold text-[#06b6d4] border-b border-white/5 pb-1 mb-1.5 uppercase text-[8px] tracking-wider">Rooms</div>
                    {Object.keys(notebook.rooms).map((id) => {
                      const status = notebook.rooms[id as RoomId];
                      const name = id.replace(/_/g, " ").toLowerCase();
                      const isCrossed = status !== "POSSIBLE";
                      const details = getStatusDetails(status);
                      return (
                        <div
                          key={id}
                          className={`flex items-center justify-between text-[9px] p-0.5 rounded border border-transparent hover:bg-white/[0.01] transition-colors capitalize ${
                            isCrossed ? "opacity-50 italic" : "text-[#cbd5e1] font-semibold"
                          }`}
                        >
                          <span className={`truncate max-w-[55px] ${isCrossed ? "line-through text-white/30" : "text-[#f1f5f9]"}`} title={name}>
                            {name}
                          </span>
                          <span className={`px-1 py-0.2 rounded text-[6.5px] font-mono font-bold border ${details.color} shrink-0`}>
                            {details.icon}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )
            */}

            {/* Live Conspiracy Web Graph */}
            {notebook && (
              <ConspiracyWeb detective={detective} notebook={notebook} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
