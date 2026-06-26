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
        {/* Room Labels Layer */}
        <div className="absolute inset-0 pointer-events-none z-10">
          {ROOMS.map((room) => {
            const left = (room.minX / BOARD_SIZE) * 100;
            const top = (room.minY / BOARD_SIZE) * 100;
            const width = ((room.maxX - room.minX + 1) / BOARD_SIZE) * 100;
            const height = ((room.maxY - room.minY + 1) / BOARD_SIZE) * 100;

            return (
              <div
                key={room.id}
                className="absolute flex items-center justify-center text-center font-bold pointer-events-none select-none serif-title uppercase"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                  fontSize: "clamp(7px, 1.25vw, 12px)",
                  color: "rgba(255, 255, 255, 0.72)",
                  letterSpacing: "0.06em",
                  textShadow: "0 2px 4px rgba(0,0,0,0.85)",
                  lineHeight: 1.2,
                  whiteSpace: "pre-line",
                  padding: "6px",
                }}
              >
                {room.name}
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
