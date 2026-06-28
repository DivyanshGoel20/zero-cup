"use client";

import { useMemo } from "react";
import { BOARD_SIZE, ROOMS } from "@/lib/game/constants";
import { getCellType } from "@/lib/game/board";
import type { DetectiveState, Position } from "@/lib/game/types";
import { BoardCell } from "./BoardCell";
import { DetectivePawn } from "./DetectivePawn";

interface GameBoardProps {
  detectives: DetectiveState[];
  activeDetectiveId: string;
  highlightedCells?: Position[];
  onCellClick?: (pos: Position) => void;
}

export function GameBoard({
  detectives,
  activeDetectiveId,
  highlightedCells = [],
  onCellClick,
}: GameBoardProps) {
  // Pre-compute all cell types once (memoised — never changes at runtime)
  const cells = useMemo(() => {
    const grid: { x: number; y: number; type: ReturnType<typeof getCellType> }[] = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        grid.push({ x, y, type: getCellType(x, y) });
      }
    }
    return grid;
  }, []);

  // Build a map: "x,y" -> list of detective states at that position
  const pawnMap = useMemo(() => {
    const map = new Map<string, DetectiveState[]>();
    for (const det of detectives) {
      const key = `${det.position.x},${det.position.y}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(det);
    }
    return map;
  }, [detectives]);

  // Build a set of highlighted cell keys
  const highlightedSet = useMemo(() => {
    return new Set(highlightedCells.map((p) => `${p.x},${p.y}`));
  }, [highlightedCells]);

  return (
    <div
      className="board-frame rounded-xl p-3 w-full"
      style={{ aspectRatio: "1 / 1" }}
    >
      <div
        className="board-felt rounded-lg w-full h-full relative"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
        }}
      >
        {/* Room Background Art Layer */}
        <div className="absolute inset-0 pointer-events-none z-0">
          {ROOMS.map((room) => {
            const left = (room.minX / BOARD_SIZE) * 100;
            const top = (room.minY / BOARD_SIZE) * 100;
            const width = ((room.maxX - room.minX + 1) / BOARD_SIZE) * 100;
            const height = ((room.maxY - room.minY + 1) / BOARD_SIZE) * 100;

            const imageMap: Record<string, string> = {
              BILLIARD_ROOM: "/room_billiard_room.png",
              CONSERVATORY: "/room_conservatory.png",
              LIBRARY: "/room_library.png",
              WINE_CELLAR: "/room_wine_cellar.png",
              GRAND_FOYER: "/room_grand_foyer.png",
              MASTER_BEDROOM: "/room_master_bedroom.png",
              KITCHEN: "/room_kitchen.png",
              DINING_HALL: "/room_dining_hall.png",
              SECRET_STUDY: "/room_secret_study.png",
            };

            return (
              <div
                key={`bg-${room.id}`}
                className="absolute overflow-hidden rounded-md transition-all duration-300"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                  backgroundImage: `url(${imageMap[room.id] || "/room_card_bg.png"})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  boxShadow: "inset 0 0 30px rgba(0,0,0,0.85)",
                }}
              >
                {/* Dark Vignette Overlay for Pawn visibility & contrast */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: "radial-gradient(circle, rgba(15,23,42,0.15) 0%, rgba(8,12,21,0.65) 100%)",
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Room Labels Layer */}
        <div className="absolute inset-0 pointer-events-none z-10">
          {ROOMS.map((room) => {
            const left = (room.minX / BOARD_SIZE) * 100;
            const top = (room.minY / BOARD_SIZE) * 100;
            const width = ((room.maxX - room.minX + 1) / BOARD_SIZE) * 100;
            const height = ((room.maxY - room.minY + 1) / BOARD_SIZE) * 100;

            return (
              <div
                key={`label-${room.id}`}
                className="absolute flex items-center justify-center pointer-events-none select-none"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                }}
              >
                {/* Burnished brass plaque */}
                <div
                  className="px-2.5 py-1 rounded bg-[#0b0c10]/90 border-y border-[#b89255]/40 shadow-[0_3px_8px_rgba(0,0,0,0.7)] font-bold text-center uppercase tracking-wider serif-title text-[#e2c185] backdrop-blur-[1px] select-none"
                  style={{
                    fontSize: "clamp(6px, 1.2vw, 9px)",
                    letterSpacing: "0.1em",
                    borderInlineWidth: "3px",
                    borderInlineColor: "#b89255",
                    textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                  }}
                >
                  {room.name}
                </div>
              </div>
            );
          })}
        </div>

        {cells.map(({ x, y, type }) => {
          const key = `${x},${y}`;
          const pawnsHere = pawnMap.get(key) ?? [];
          const isHighlighted = highlightedSet.has(key);

          return (
            <BoardCell
              key={key}
              x={x}
              y={y}
              cellType={type}
              isHighlighted={isHighlighted}
              onClick={() => onCellClick?.({ x, y })}
            >
              {pawnsHere.map((det, idx) => (
                <DetectivePawn
                  key={det.id}
                  color={det.color}
                  name={det.name}
                  isActive={det.id === activeDetectiveId}
                  isEliminated={det.eliminated}
                  stackIndex={idx}
                />
              ))}
            </BoardCell>
          );
        })}
      </div>
    </div>
  );
}
