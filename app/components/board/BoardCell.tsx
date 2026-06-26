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
      bg = isHighlighted
        ? "radial-gradient(circle, rgba(184,146,85,0.4) 0%, rgba(184,146,85,0.15) 100%)"
        : "radial-gradient(circle at center, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.25) 100%)";
      border = isHighlighted ? "border-[#b89255]/60" : "border-white/[0.04]";
      break;
    case "door":
      bg = isHighlighted
        ? "radial-gradient(circle, rgba(184,146,85,0.5) 0%, rgba(184,146,85,0.25) 100%)"
        : (roomId ? "rgba(184,146,85,0.15)" : "rgba(255,255,255,0.06)");
      border = "border-[#b89255]/40 border-dashed border-2";
      extraClass = "ring-1 ring-[#b89255]/30 shadow-[inset_0_0_8px_rgba(184,146,85,0.15)]";
      break;
    case "wall":
      bg = "transparent";
      border = "border-transparent";
      break;
    case "room_center":
      bg = isHighlighted
        ? "radial-gradient(circle, rgba(184,146,85,0.4) 0%, rgba(184,146,85,0.15) 100%)"
        : "transparent";
      border = isHighlighted ? "border-[#b89255]/60" : "border-transparent";
      break;
  }

  // Draw room background and borders (thick walls) for rooms
  if (roomId) {
    if (!isHighlighted || cellType !== "room_center") {
      bg = ROOM_GRADIENTS[roomId];
    }
    if (roomConfig && cellType !== "door") {
      const borderTheme = "3px solid #5a3e1a"; // Mahogany wood walls
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
        isHighlighted ? "hover:brightness-125 hover:shadow-[0_0_8px_rgba(184,146,85,0.6)] cursor-pointer" : ""
      }`}
      style={{ backgroundColor: bg, cursor: isHighlighted ? "pointer" : cursor, ...borderStyle }}
      data-cell={`${x},${y}`}
      data-type={cellType}
    >

      {cellType === "door" && (
        <span
          className="absolute inset-0 flex items-center justify-center pointer-events-none text-[8px] sm:text-[10px] text-amber-500/90 filter drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)] animate-pulse"
        >
          🚪
        </span>
      )}

      {children}
    </div>
  );
});
