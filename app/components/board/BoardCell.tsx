"use client";

import { memo } from "react";
import type { CellType, RoomId } from "@/lib/game/types";
import { ROOMS } from "@/lib/game/constants";

const ROOM_COLORS: Record<RoomId, string> = {
  GRAND_FOYER:    "rgba(184,146,85,0.18)",
  BILLIARD_ROOM:  "rgba(139,92,246,0.18)",
  CONSERVATORY:   "rgba(16,185,129,0.18)",
  LIBRARY:        "rgba(6,182,212,0.18)",
  WINE_CELLAR:    "rgba(244,63,94,0.18)",
  MASTER_BEDROOM: "rgba(245,158,11,0.18)",
  KITCHEN:        "rgba(249,115,22,0.18)",
  DINING_HALL:    "rgba(100,116,139,0.18)",
  SECRET_STUDY:   "rgba(168,85,247,0.18)",
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
  children,
}: BoardCellProps) {
  const roomId = getRoomForCell(x, y);

  let bg = "transparent";
  let border = "border-white/[0.04]";
  let cursor = "default";
  let extraClass = "";

  switch (cellType) {
    case "hallway":
      bg = isHighlighted ? "rgba(184,146,85,0.25)" : "rgba(255,255,255,0.02)";
      border = isHighlighted ? "border-[#b89255]/60" : "border-white/[0.04]";
      break;
    case "door":
      bg = isHighlighted
        ? "rgba(184,146,85,0.35)"
        : (roomId ? ROOM_COLORS[roomId] : "rgba(255,255,255,0.06)");
      border = "border-[#b89255]/30";
      extraClass = "ring-1 ring-[#b89255]/20";
      break;
    case "wall":
      bg = roomId ? ROOM_COLORS[roomId] : "rgba(255,255,255,0.01)";
      border = "border-white/[0.02]";
      break;
    case "room_center":
      bg = roomId ? ROOM_COLORS[roomId] : "transparent";
      border = "border-white/[0.02]";
      break;
  }

  return (
    <div
      className={`relative flex items-center justify-center border ${border} ${extraClass} transition-colors duration-150`}
      style={{ backgroundColor: bg, cursor }}
      data-cell={`${x},${y}`}
      data-type={cellType}
    >
      {cellType === "room_center" && roomId && (
        <span
          className="absolute inset-0 flex items-center justify-center text-center font-semibold pointer-events-none select-none"
          style={{
            fontSize: "clamp(5px, 0.55vw, 9px)",
            color: "rgba(255,255,255,0.55)",
            lineHeight: 1.2,
            whiteSpace: "pre-line",
            padding: "1px",
          }}
        >
          {ROOM_LABELS[roomId]}
        </span>
      )}

      {cellType === "door" && (
        <span
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ fontSize: "clamp(4px, 0.4vw, 7px)", color: "rgba(184,146,85,0.7)" }}
        >
          ▪
        </span>
      )}

      {children}
    </div>
  );
});
