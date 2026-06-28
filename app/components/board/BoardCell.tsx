"use client";

import { memo } from "react";
import type { CellType, RoomId } from "@/lib/game/types";
import { ROOMS } from "@/lib/game/constants";

const ROOM_GRADIENTS: Record<RoomId, string> = {
  GRAND_FOYER:    "radial-gradient(circle, rgba(184,146,85,0.28) 0%, rgba(20,15,10,0.6) 100%)",
  BILLIARD_ROOM:  "radial-gradient(circle, rgba(16,185,129,0.3) 0%, rgba(10,25,15,0.6) 100%)",
  CONSERVATORY:   "radial-gradient(circle, rgba(52,211,153,0.22) 0%, rgba(15,30,25,0.6) 100%)",
  LIBRARY:        "radial-gradient(circle, rgba(139,92,246,0.22) 0%, rgba(20,10,30,0.6) 100%)",
  WINE_CELLAR:    "radial-gradient(circle, rgba(159,18,57,0.3) 0%, rgba(30,10,15,0.6) 100%)",
  MASTER_BEDROOM: "radial-gradient(circle, rgba(217,119,6,0.22) 0%, rgba(30,20,10,0.6) 100%)",
  KITCHEN:        "radial-gradient(circle, rgba(234,88,12,0.22) 0%, rgba(35,15,10,0.6) 100%)",
  DINING_HALL:    "radial-gradient(circle, rgba(148,163,184,0.18) 0%, rgba(20,25,30,0.6) 100%)",
  SECRET_STUDY:   "radial-gradient(circle, rgba(168,85,247,0.22) 0%, rgba(25,10,35,0.6) 100%)",
};

const ROOM_LABELS: Record<RoomId, string> = {
  GRAND_FOYER:    "Grand\nFoyer",
  BILLIARD_ROOM:  "Billiard\nRoom",
  CONSERVATORY:   "Conserv-\natory",
  LIBRARY:        "Library",
  WINE_CELLAR:    "Wine\nCellar",
  MASTER_BEDROOM: "Master\nBedroom",
  KITCHEN:        "Kitchen",
  DINING_HALL:    "Dining\nHall",
  SECRET_STUDY:   "Secret\nStudy",
};

interface BoardCellProps {
  x: number;
  y: number;
  cellType: CellType;
  isHighlighted: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}

function getRoomForCell(x: number, y: number): RoomId | null {
  for (const room of ROOMS) {
    if (x >= room.minX && x <= room.maxX && y >= room.minY && y <= room.maxY) {
      return room.id;
    }
  }
  return null;
}

export const BoardCell = memo(function BoardCell({
  x,
  y,
  cellType,
  isHighlighted,
  onClick,
  children,
}: BoardCellProps) {
  const roomId = getRoomForCell(x, y);
  const roomConfig = roomId ? ROOMS.find((r) => r.id === roomId) : null;

  let bg = "transparent";
  let border = "border-white/[0.04]";
  let cursor = "default";
  let extraClass = "";
  let borderStyle: React.CSSProperties = {};

  switch (cellType) {
    case "hallway":
      const isEven = (x + y) % 2 === 0;
      bg = isHighlighted
        ? "radial-gradient(circle, rgba(212,175,55,0.75) 0%, rgba(184,146,85,0.35) 60%, rgba(184,146,85,0.15) 100%)"
        : isEven
        ? "linear-gradient(135deg, rgba(80,48,24,0.38) 0%, rgba(50,28,10,0.28) 100%)"
        : "linear-gradient(135deg, rgba(55,32,14,0.28) 0%, rgba(35,18,6,0.38) 100%)";
      border = isHighlighted
        ? "border-[#d4af37] border-2 shadow-[0_0_12px_rgba(212,175,55,0.85)] z-20"
        : isEven
        ? "border-[#6b3e1a]/30"
        : "border-[#4a2a0e]/20";
      break;
    case "door":
      bg = isHighlighted
        ? "radial-gradient(circle, rgba(212,175,55,0.85) 0%, rgba(184,146,85,0.4) 60%, rgba(184,146,85,0.15) 100%)"
        : "rgba(184,146,85,0.06)";
      border = isHighlighted ? "border-[#d4af37] border-2 shadow-[0_0_12px_rgba(212,175,55,0.9)] z-20" : "border-[#b89255]/50 border-dashed border-[1.5px]";
      extraClass = isHighlighted ? "" : "shadow-[inset_0_0_6px_rgba(184,146,85,0.1)]";
      break;
    case "wall":
      bg = "transparent";
      border = "border-transparent";
      break;
    case "room_center":
      bg = isHighlighted
        ? "radial-gradient(circle, rgba(212,175,55,0.7) 0%, rgba(184,146,85,0.3) 60%, rgba(184,146,85,0.1) 100%)"
        : "transparent";
      border = isHighlighted ? "border-[#d4af37] border-2 shadow-[0_0_12px_rgba(212,175,55,0.85)] z-20" : "border-transparent";
      break;
  }

  // Draw room background and borders (thick walls) for rooms
  if (roomId) {
    if (isHighlighted && cellType === "room_center") {
      bg = "radial-gradient(circle, rgba(212,175,55,0.55) 0%, rgba(184,146,85,0.2) 60%, transparent 100%)";
    } else {
      bg = "transparent";
    }
    if (roomConfig && cellType !== "door") {
      const borderTheme = "2px solid #5a3e1a"; // Mahogany wood walls
      if (x === roomConfig.minX) borderStyle.borderLeft = borderTheme;
      if (x === roomConfig.maxX) borderStyle.borderRight = borderTheme;
      if (y === roomConfig.minY) borderStyle.borderTop = borderTheme;
      if (y === roomConfig.maxY) borderStyle.borderBottom = borderTheme;
    }
  }

  return (
    <div
      onClick={isHighlighted ? onClick : undefined}
      className={`relative flex items-center justify-center border ${border} ${extraClass} transition-colors duration-150 ${
        isHighlighted ? "hover:brightness-125 hover:shadow-[0_0_15px_rgba(212,175,55,0.9)] cursor-pointer" : ""
      }`}
      style={{ backgroundColor: bg, cursor: isHighlighted ? "pointer" : cursor, ...borderStyle }}
      data-cell={`${x},${y}`}
      data-type={cellType}
    >

      {isHighlighted && (
        <>
          <span className="absolute w-2 h-2 rounded-full bg-[#d4af37] shadow-[0_0_10px_#d4af37] animate-ping pointer-events-none z-10" />
          <span className="absolute w-1.5 h-1.5 rounded-full bg-[#d4af37] shadow-[0_0_6px_#d4af37] pointer-events-none z-10" />
        </>
      )}

      {cellType === "door" && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
          <svg
            viewBox="0 0 24 24"
            className="w-3.5 h-3.5 text-[#e2c185] animate-pulse"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 20V8a7 7 0 0 1 14 0v12M3 20h18M12 11h.01" />
          </svg>
        </span>
      )}

      {children}
    </div>
  );
});
