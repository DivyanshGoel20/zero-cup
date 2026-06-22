"use client";

import { useMemo } from "react";
import { BOARD_SIZE } from "@/lib/game/constants";
import { getCellType } from "@/lib/game/board";
import type { DetectiveState, Position } from "@/lib/game/types";
import { BoardCell } from "./BoardCell";
import { DetectivePawn } from "./DetectivePawn";

interface GameBoardProps {
  detectives: DetectiveState[];
  activeDetectiveId: string;
  highlightedCells?: Position[];
}

export function GameBoard({
  detectives,
  activeDetectiveId,
  highlightedCells = [],
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
        className="board-felt rounded-lg w-full h-full"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
        }}
      >
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
