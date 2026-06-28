"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useGameStore } from "@/lib/store/gameStore";
import type { DetectiveState, DeductionNotebook, DetectiveId, WeaponId, RoomId } from "@/lib/game/types";
import { DETECTIVE_BY_ID } from "@/lib/game/constants";

// Positions mapping for all 20 cards + envelope node
const NODE_POSITIONS: Record<
  string,
  { x: number; y: number; label: string; image: string; color: string; type: "suspect" | "weapon" | "room" | "envelope" }
> = {
  // Detectives (Suspects)
  VANCE: { x: 70, y: 55, label: "Vance", image: "/detective_vance.png", color: "#8b5cf6", type: "suspect" },
  ROSEWOOD: { x: 55, y: 135, label: "Rosewood", image: "/detective_rosewood.png", color: "#f43f5e", type: "suspect" },
  BLACKWOOD: { x: 80, y: 215, label: "Blackwood", image: "/detective_blackwood.png", color: "#06b6d4", type: "suspect" },
  STERLING: { x: 55, y: 295, label: "Sterling", image: "/detective_sterling.png", color: "#10b981", type: "suspect" },
  ASHCROFT: { x: 70, y: 375, label: "Ashcroft", image: "/detective_ashcroft.png", color: "#f59e0b", type: "suspect" },

  // Weapons
  PEARL_PISTOL: { x: 260, y: 55, label: "Pistol", image: "/weapon_pistol.png", color: "#f59e0b", type: "weapon" },
  LETTER_OPENER: { x: 245, y: 120, label: "Opener", image: "/weapon_opener.png", color: "#f59e0b", type: "weapon" },
  STRYCHNINE: { x: 275, y: 185, label: "Strychnine", image: "/weapon_strychnine.png", color: "#f59e0b", type: "weapon" },
  BRASS_CLOCK: { x: 250, y: 250, label: "Clock", image: "/weapon_clock.png", color: "#f59e0b", type: "weapon" },
  SILK_TIE: { x: 265, y: 315, label: "Silk Tie", image: "/weapon_tie.png", color: "#f59e0b", type: "weapon" },
  WALKING_CANE: { x: 245, y: 380, label: "Cane", image: "/weapon_cane.png", color: "#f59e0b", type: "weapon" },

  // Rooms
  BILLIARD_ROOM: { x: 440, y: 45, label: "Billiard Rm", image: "/room_billiard_room.png", color: "#06b6d4", type: "room" },
  CONSERVATORY: { x: 420, y: 88, label: "Conservatory", image: "/room_conservatory.png", color: "#06b6d4", type: "room" },
  LIBRARY: { x: 450, y: 130, label: "Library", image: "/room_library.png", color: "#06b6d4", type: "room" },
  WINE_CELLAR: { x: 425, y: 172, label: "Wine Cellar", image: "/room_wine_cellar.png", color: "#06b6d4", type: "room" },
  GRAND_FOYER: { x: 445, y: 215, label: "Foyer", image: "/room_grand_foyer.png", color: "#06b6d4", type: "room" },
  MASTER_BEDROOM: { x: 420, y: 258, label: "Bedroom", image: "/room_master_bedroom.png", color: "#06b6d4", type: "room" },
  KITCHEN: { x: 450, y: 300, label: "Kitchen", image: "/room_kitchen.png", color: "#06b6d4", type: "room" },
  DINING_HALL: { x: 425, y: 342, label: "Dining Hall", image: "/room_dining_hall.png", color: "#06b6d4", type: "room" },
  SECRET_STUDY: { x: 445, y: 385, label: "Study", image: "/room_secret_study.png", color: "#06b6d4", type: "room" },

  // Envelope / Solution Node
  ENVELOPE: { x: 550, y: 215, label: "Envelope", image: "/logo.png", color: "#b89255", type: "envelope" },
};

interface ConspiracyWebProps {
  detective: DetectiveState;
  notebook: DeductionNotebook;
}

interface Thread {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  width: number;
  dashed?: boolean;
  glowing?: boolean;
  label?: string;
}

export function ConspiracyWeb({ detective, notebook }: ConspiracyWebProps) {
  const { detectives, hands } = useGameStore();
  const [hoveredNode, setHoveredNode] = useState<{ id: string; name: string; status: string } | null>(null);

  // Match cards with their actual holders
  const findCardHolder = (cardId: string): DetectiveId | null => {
    for (const det of detectives) {
      if (det.id === detective.id) continue;
      const holdsCard = det.cards.some((c) => c.id === cardId);
      if (holdsCard) return det.id;
    }
    return null;
  };

  // Check how many items are still marked as POSSIBLE per category
  const solvedState = useMemo(() => {
    const possibleSuspects = (Object.keys(notebook.suspects) as DetectiveId[]).filter(
      (id) => notebook.suspects[id] === "POSSIBLE"
    );
    const possibleWeapons = (Object.keys(notebook.weapons) as WeaponId[]).filter(
      (id) => notebook.weapons[id] === "POSSIBLE"
    );
    const possibleRooms = (Object.keys(notebook.rooms) as RoomId[]).filter(
      (id) => notebook.rooms[id] === "POSSIBLE"
    );

    return {
      suspect: possibleSuspects.length === 1 ? possibleSuspects[0] : null,
      weapon: possibleWeapons.length === 1 ? possibleWeapons[0] : null,
      room: possibleRooms.length === 1 ? possibleRooms[0] : null,
      isFullySolved: possibleSuspects.length === 1 && possibleWeapons.length === 1 && possibleRooms.length === 1,
    };
  }, [notebook]);

  // Compute threads dynamically
  const threads = useMemo(() => {
    const result: Thread[] = [];
    const viewerPos = NODE_POSITIONS[detective.id];
    if (!viewerPos) return result;

    // --- SUSPECTS ---
    Object.keys(notebook.suspects).forEach((id) => {
      const status = notebook.suspects[id as DetectiveId];
      const targetPos = NODE_POSITIONS[id];
      if (!targetPos) return;

      // Skip drawing a line to oneself
      if (id === detective.id) return;

      if (status === "HELD_BY_ME") {
        result.push({
          id: `held-me-${id}`,
          fromX: viewerPos.x,
          fromY: viewerPos.y,
          toX: targetPos.x,
          toY: targetPos.y,
          color: "#10b981", // Emerald green for my hand
          width: 2,
        });
      } else if (status === "HELD_BY_OTHER") {
        const holder = findCardHolder(id);
        if (holder && NODE_POSITIONS[holder]) {
          const holderPos = NODE_POSITIONS[holder];
          result.push({
            id: `held-other-${id}`,
            fromX: holderPos.x,
            fromY: holderPos.y,
            toX: targetPos.x,
            toY: targetPos.y,
            color: "#3b82f6", // Blue for known rival card
            width: 2,
          });
        }
      } else if (status === "POSSIBLE" && solvedState.suspect !== id) {
        result.push({
          id: `suspect-${id}`,
          fromX: viewerPos.x,
          fromY: viewerPos.y,
          toX: targetPos.x,
          toY: targetPos.y,
          color: "#ef4444", // Crimson red for suspicion
          width: 2,
        });
      }
    });

    // --- WEAPONS ---
    Object.keys(notebook.weapons).forEach((id) => {
      const status = notebook.weapons[id as WeaponId];
      const targetPos = NODE_POSITIONS[id];
      if (!targetPos) return;

      if (status === "HELD_BY_ME") {
        result.push({
          id: `held-me-${id}`,
          fromX: viewerPos.x,
          fromY: viewerPos.y,
          toX: targetPos.x,
          toY: targetPos.y,
          color: "#10b981",
          width: 2,
        });
      } else if (status === "HELD_BY_OTHER") {
        const holder = findCardHolder(id);
        if (holder && NODE_POSITIONS[holder]) {
          const holderPos = NODE_POSITIONS[holder];
          result.push({
            id: `held-other-${id}`,
            fromX: holderPos.x,
            fromY: holderPos.y,
            toX: targetPos.x,
            toY: targetPos.y,
            color: "#3b82f6",
            width: 2,
          });
        }
      } else if (status === "POSSIBLE" && solvedState.weapon !== id) {
        result.push({
          id: `weapon-${id}`,
          fromX: viewerPos.x,
          fromY: viewerPos.y,
          toX: targetPos.x,
          toY: targetPos.y,
          color: "#ef4444",
          width: 2,
        });
      }
    });

    // --- ROOMS ---
    Object.keys(notebook.rooms).forEach((id) => {
      const status = notebook.rooms[id as RoomId];
      const targetPos = NODE_POSITIONS[id];
      if (!targetPos) return;

      if (status === "HELD_BY_ME") {
        result.push({
          id: `held-me-${id}`,
          fromX: viewerPos.x,
          fromY: viewerPos.y,
          toX: targetPos.x,
          toY: targetPos.y,
          color: "#10b981",
          width: 2,
        });
      } else if (status === "HELD_BY_OTHER") {
        const holder = findCardHolder(id);
        if (holder && NODE_POSITIONS[holder]) {
          const holderPos = NODE_POSITIONS[holder];
          result.push({
            id: `held-other-${id}`,
            fromX: holderPos.x,
            fromY: holderPos.y,
            toX: targetPos.x,
            toY: targetPos.y,
            color: "#3b82f6",
            width: 2,
          });
        }
      } else if (status === "POSSIBLE" && solvedState.room !== id) {
        result.push({
          id: `room-${id}`,
          fromX: viewerPos.x,
          fromY: viewerPos.y,
          toX: targetPos.x,
          toY: targetPos.y,
          color: "#ef4444",
          width: 2,
        });
      }
    });

    // --- GOLD SOLUTION THREADS TO ENVELOPE ---
    const envPos = NODE_POSITIONS.ENVELOPE;
    if (envPos) {
      if (solvedState.suspect) {
        const p = NODE_POSITIONS[solvedState.suspect];
        if (p) result.push({ id: `solved-suspect`, fromX: p.x, fromY: p.y, toX: envPos.x, toY: envPos.y, color: "#d97706", width: 3.5, glowing: true });
      }
      if (solvedState.weapon) {
        const p = NODE_POSITIONS[solvedState.weapon];
        if (p) result.push({ id: `solved-weapon`, fromX: p.x, fromY: p.y, toX: envPos.x, toY: envPos.y, color: "#d97706", width: 3.5, glowing: true });
      }
      if (solvedState.room) {
        const p = NODE_POSITIONS[solvedState.room];
        if (p) result.push({ id: `solved-room`, fromX: p.x, fromY: p.y, toX: envPos.x, toY: envPos.y, color: "#d97706", width: 3.5, glowing: true });
      }
    }

    return result;
  }, [notebook, detective.id, solvedState]);

  // Helper to draw slightly wobbly wool threads (saggy quadratic bezier curves)
  const getBezierPath = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const isVertical = Math.abs(dy) > Math.abs(dx);

    let cx = mx;
    let cy = my;
    if (isVertical) {
      cx = mx + 12; // vertical bow
    } else {
      cy = my + 14; // sag downward due to "gravity"
    }

    return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  };

  const getStatusText = (id: string, type: string) => {
    if (type === "envelope") return "Murder Solution Envelope";
    if (id === detective.id) return "Current Detective (You)";
    
    if (type === "suspect") {
      const s = notebook.suspects[id as DetectiveId];
      if (s === "POSSIBLE") return "Suspected / Unresolved";
      if (s === "HELD_BY_ME") return "In Your Hand (Innocent)";
      if (s === "HELD_BY_OTHER") return "Held by Rival (Innocent)";
      if (s === "ELIMINATED") return "Confirmed Innocent";
    }
    if (type === "weapon") {
      const w = notebook.weapons[id as WeaponId];
      if (w === "POSSIBLE") return "Suspected / Unresolved";
      if (w === "HELD_BY_ME") return "In Your Hand (Innocent)";
      if (w === "HELD_BY_OTHER") return "Held by Rival (Innocent)";
      if (w === "ELIMINATED") return "Confirmed Innocent";
    }
    if (type === "room") {
      const r = notebook.rooms[id as RoomId];
      if (r === "POSSIBLE") return "Suspected / Unresolved";
      if (r === "HELD_BY_ME") return "In Your Hand (Innocent)";
      if (r === "HELD_BY_OTHER") return "Held by Rival (Innocent)";
      if (r === "ELIMINATED") return "Confirmed Innocent";
    }
    return "Unknown status";
  };

  return (
    <div className="relative rounded-xl border border-white/5 bg-[#090b11] p-3 shadow-inner overflow-hidden select-none">
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/[0.03] text-[9px] font-mono text-[#cbd5e1]">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-[#ef4444] rounded-full animate-pulse" />
          <span className="font-bold tracking-wider text-[#b89255] uppercase">Conspiracy Board</span>
        </div>
        <div className="flex items-center gap-3 opacity-80 scale-90">
          <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-[#ef4444] inline-block" /> Suspicion</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-[#10b981] inline-block" /> My Hand</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-[#3b82f6] inline-block" /> Rival</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-[#d97706] inline-block" /> Solution</span>
        </div>
      </div>

      {/* SVG Board */}
      <div className="relative bg-slate-950/40 rounded-lg overflow-hidden border border-white/[0.02]">
        <svg viewBox="0 0 600 430" width="100%" height="auto" className="block relative z-10">
          <defs>
            {/* Soft shadow for pins and threads */}
            <filter id="corkShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="1.5" dy="2" stdDeviation="1.5" floodOpacity="0.8" floodColor="#000000" />
            </filter>
            {/* Metallic pin gradients */}
            <radialGradient id="pinGold" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#ffe4e6" />
              <stop offset="30%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#be123c" />
            </radialGradient>
            <radialGradient id="pinMetal" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="40%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#475569" />
            </radialGradient>
          </defs>

          {/* Grid corkboard background wires */}
          <g opacity="0.08" stroke="#ffffff" strokeWidth="0.5">
            <line x1="0" y1="100" x2="600" y2="100" strokeDasharray="3,3" />
            <line x1="0" y1="200" x2="600" y2="200" strokeDasharray="3,3" />
            <line x1="0" y1="300" x2="600" y2="300" strokeDasharray="3,3" />
            <line x1="160" y1="0" x2="160" y2="430" strokeDasharray="3,3" />
            <line x1="330" y1="0" x2="330" y2="430" strokeDasharray="3,3" />
          </g>

          {/* Threads Layer */}
          <g filter="url(#corkShadow)">
            {threads.map((thread) => {
              const pathStr = getBezierPath(thread.fromX, thread.fromY, thread.toX, thread.toY);
              return (
                <g key={thread.id}>
                  {/* Glowing halo behind gold lines */}
                  {thread.glowing && (
                    <motion.path
                      d={pathStr}
                      fill="none"
                      stroke={thread.color}
                      strokeWidth={thread.width + 4}
                      opacity={0.3}
                      className="blur-sm"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1 }}
                    />
                  )}
                  {/* Active string thread */}
                  <motion.path
                    d={pathStr}
                    fill="none"
                    stroke={thread.color}
                    strokeWidth={thread.width}
                    strokeDasharray={thread.dashed ? "4,4" : undefined}
                    opacity={0.8}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.8 }}
                  />
                </g>
              );
            })}
          </g>

          {/* Nodes Layer */}
          <g>
            {Object.entries(NODE_POSITIONS).map(([id, pos]) => {
              const isCurrentDet = id === detective.id;
              
              // Determine status in notebook
              let isEliminated = false;
              let isMe = false;
              let isRival = false;
              let isSolution = false;

              if (pos.type === "envelope") {
                isSolution = true;
              } else if (pos.type === "suspect") {
                const s = notebook.suspects[id as DetectiveId];
                isEliminated = s === "ELIMINATED" || s === "HELD_BY_OTHER";
                isMe = s === "HELD_BY_ME";
                isRival = s === "HELD_BY_OTHER";
              } else if (pos.type === "weapon") {
                const w = notebook.weapons[id as WeaponId];
                isEliminated = w === "ELIMINATED" || w === "HELD_BY_OTHER";
                isMe = w === "HELD_BY_ME";
                isRival = w === "HELD_BY_OTHER";
              } else if (pos.type === "room") {
                const r = notebook.rooms[id as RoomId];
                isEliminated = r === "ELIMINATED" || r === "HELD_BY_OTHER";
                isMe = r === "HELD_BY_ME";
                isRival = r === "HELD_BY_OTHER";
              }

              // Solution overlay highlight
              const isCategorySolved = 
                (pos.type === "suspect" && solvedState.suspect === id) ||
                (pos.type === "weapon" && solvedState.weapon === id) ||
                (pos.type === "room" && solvedState.room === id);

              const nameText = DETECTIVE_BY_ID[id]?.name || pos.label;

              return (
                <g
                  key={id}
                  className="cursor-pointer"
                  onMouseEnter={() =>
                    setHoveredNode({
                      id,
                      name: nameText,
                      status: getStatusText(id, pos.type),
                    })
                  }
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  {/* Clip-path for avatar image */}
                  <defs>
                    <clipPath id={`clip-${id}-${detective.id}`}>
                      <circle cx={pos.x} cy={pos.y} r={14} />
                    </clipPath>
                  </defs>

                  {/* Solved outer gold pulse glow ring */}
                  {isCategorySolved && (
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={20}
                      fill="none"
                      stroke="#d97706"
                      strokeWidth={1.5}
                      className="animate-pulse"
                      opacity="0.8"
                    />
                  )}

                  {/* Outer ring color code */}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={16}
                    fill={isEliminated ? "#1e293b" : "#0d131f"}
                    stroke={
                      isCategorySolved
                        ? "#d97706"
                        : isCurrentDet
                        ? isMe
                          ? "#10b981" // I hold my own card! -> Green
                          : isEliminated
                          ? "#3b82f6" // Someone else holds my card! -> Blue
                          : "#ef4444" // I don't know where my card is -> Pulsing red
                        : isMe
                        ? "#10b981" // In my hand
                        : isRival
                        ? "#3b82f6" // In rival's hand
                        : "#334155" // Default gray
                    }
                    strokeWidth={isCurrentDet ? 2.5 : 1.5}
                    strokeDasharray={isCurrentDet && !isMe && !isEliminated ? "2,2" : undefined}
                    opacity={isEliminated && !isCurrentDet ? 0.45 : 1}
                    filter="url(#corkShadow)"
                    className={isCurrentDet && !isMe && !isEliminated ? "animate-pulse" : undefined}
                  />

                  {/* Image/Avatar inside node */}
                  <image
                    href={pos.image}
                    x={pos.x - 14}
                    y={pos.y - 14}
                    width={28}
                    height={28}
                    clipPath={`url(#clip-${id}-${detective.id})`}
                    preserveAspectRatio="xMidYMid slice"
                    opacity={isEliminated ? 0.35 : 0.9}
                  />

                  {/* Red "X" drawn on card photo if eliminated */}
                  {isEliminated && (
                    <path
                      d={`M ${pos.x - 8} ${pos.y - 8} L ${pos.x + 8} ${pos.y + 8} M ${pos.x + 8} ${pos.y - 8} L ${pos.x - 8} ${pos.y + 8}`}
                      stroke="#f43f5e"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      opacity={0.8}
                    />
                  )}

                  {/* Push pin center dot */}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={3.5}
                    fill={isCurrentDet ? "url(#pinGold)" : "url(#pinMetal)"}
                    filter="url(#corkShadow)"
                  />

                  {/* Text Label */}
                  <text
                    x={pos.x}
                    y={pos.y + 24}
                    textAnchor="middle"
                    fill={
                      isCurrentDet
                        ? isMe
                          ? "#10b981"
                          : isEliminated
                          ? "#3b82f6"
                          : "#ef4444"
                        : isEliminated
                        ? "#475569"
                        : "#cbd5e1"
                    }
                    fontWeight={isCurrentDet ? "bold" : "normal"}
                    fontStyle={isEliminated ? "italic" : "normal"}
                    textDecoration={isEliminated ? "line-through" : undefined}
                    className="font-mono text-[8px] tracking-wide"
                  >
                    {pos.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Hover Information Dialog Card (Moved outside the SVG wrapper to prevent overlap) */}
      <div className="mt-2.5 bg-slate-950/90 border border-white/5 p-2 rounded-lg text-[9px] font-mono leading-relaxed transition-all duration-300 flex items-center justify-between min-h-[38px] z-20 backdrop-blur-md">
        {hoveredNode ? (
          <>
            <div className="flex flex-col">
              <span className="text-[#b89255] font-extrabold uppercase">{hoveredNode.name}</span>
              <span className="text-[#94a3b8]">{hoveredNode.status}</span>
            </div>
            <span className="text-[14px] leading-none shrink-0 filter drop-shadow">
              {hoveredNode.status.includes("Suspected") ? "🔍" : hoveredNode.status.includes("Hand") || hoveredNode.status.includes("Rival") ? "🎴" : hoveredNode.id === "ENVELOPE" ? "✉️" : "❌"}
            </span>
          </>
        ) : (
          <span className="text-slate-500 italic block mx-auto text-center py-1">
            Hover over pins/clues on {detective.name}&apos;s Conspiracy Board to analyze suspicions
          </span>
        )}
      </div>
    </div>
  );
}
