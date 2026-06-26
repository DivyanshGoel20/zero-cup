import type { Position, CellType, RoomId } from "./types";
import { ROOMS, BOARD_SIZE } from "./constants";

// ============================================================
// CELL CLASSIFICATION
// ============================================================

/** Returns the room that contains position (x, y), or null if it's a hallway. */
export function getRoomAt(x: number, y: number): RoomId | null {
  for (const room of ROOMS) {
    if (x >= room.minX && x <= room.maxX && y >= room.minY && y <= room.maxY) {
      return room.id;
    }
  }
  return null;
}

/** Returns true when (x, y) is one of the designated door cells for any room. */
export function isDoorCell(x: number, y: number): boolean {
  for (const room of ROOMS) {
    if (room.doors.some((d) => d.x === x && d.y === y)) return true;
  }
  return false;
}

/**
 * Classifies a grid cell into one of four types:
 *  - "door"       → a room entrance (walkable, part of a room boundary)
 *  - "wall"       → interior of a room (not walkable by pawns)
 *  - "hallway"    → open corridor outside all rooms (walkable)
 *  - "room_center"→ the display/render centre of a room (not walkable)
 */
export function getCellType(x: number, y: number): CellType {
  if (isDoorCell(x, y)) return "door";

  const roomId = getRoomAt(x, y);
  if (roomId) {
    // Mark the exact centre cell so the board renderer can draw the room label
    const room = ROOMS.find((r) => r.id === roomId)!;
    if (x === room.center.x && y === room.center.y) return "room_center";
    return "wall";
  }

  return "hallway";
}

// ============================================================
// WALKABILITY
// ============================================================

/**
 * A cell is walkable if it is a hallway or a door.
 * Room interiors and walls are never navigable.
 */
export function isWalkable(x: number, y: number): boolean {
  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return false;
  const type = getCellType(x, y);
  return type === "hallway" || type === "door";
}

// ============================================================
// BFS PATHFINDING
// ============================================================

const CARDINAL = [
  { dx: 0, dy: -1 }, // N
  { dx: 1, dy: 0 },  // E
  { dx: 0, dy: 1 },  // S
  { dx: -1, dy: 0 }, // W
] as const;

/**
 * Finds the shortest walkable path between two positions using BFS.
 * Returns the full path (including start), or null if unreachable.
 */
export function findPath(
  start: Position,
  target: Position
): Position[] | null {
  if (start.x === target.x && start.y === target.y) return [start];

  // If we started inside a room and the neighbor is in the same room, it's walkable
  const startRoomId = getRoomAt(start.x, start.y);
  const queue: { pos: Position; path: Position[] }[] = [
    { pos: start, path: [start] },
  ];
  const visited = new Set<string>([`${start.x},${start.y}`]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const { x, y } = current.pos;

    for (const { dx, dy } of CARDINAL) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;

      if (visited.has(key)) continue;

      let walkable = false;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        if (startRoomId && getRoomAt(nx, ny) === startRoomId) {
          walkable = true;
        } else {
          const type = getCellType(nx, ny);
          walkable = type === "hallway" || type === "door";
        }
      }

      if (!walkable) continue;

      visited.add(key);
      const newPath = [...current.path, { x: nx, y: ny }];

      if (nx === target.x && ny === target.y) return newPath;

      queue.push({ pos: { x: nx, y: ny }, path: newPath });
    }
  }

  return null; // Target unreachable
}

/**
 * Returns all grid cells reachable from a start position within maxSteps.
 * Handles room boundary exceptions correctly.
 */
export function getReachableCells(
  start: Position,
  maxSteps: number
): Position[] {
  const startRoomId = getRoomAt(start.x, start.y);
  const queue: { pos: Position; steps: number }[] = [{ pos: start, steps: 0 }];
  const visited = new Set<string>([`${start.x},${start.y}`]);
  const reachable: Position[] = [];

  while (queue.length > 0) {
    const { pos, steps } = queue.shift()!;

    if (steps > 0) {
      reachable.push(pos);
    }

    if (steps >= maxSteps) continue;

    for (const { dx, dy } of CARDINAL) {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      const key = `${nx},${ny}`;

      if (visited.has(key)) continue;

      let walkable = false;
      if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
        if (startRoomId && getRoomAt(nx, ny) === startRoomId) {
          walkable = true;
        } else {
          const type = getCellType(nx, ny);
          walkable = type === "hallway" || type === "door";
        }
      }

      if (walkable) {
        visited.add(key);
        queue.push({ pos: { x: nx, y: ny }, steps: steps + 1 });
      }
    }
  }

  return reachable;
}

/**
 * Returns all door cells reachable from a position within a given number of steps.
 * Used by the AI strategy layer to choose a movement target.
 */
export function getReachableDoors(
  from: Position,
  maxSteps: number
): { roomId: RoomId; door: Position; distance: number }[] {
  const results: { roomId: RoomId; door: Position; distance: number }[] = [];

  for (const room of ROOMS) {
    for (const door of room.doors) {
      const path = findPath(from, door);
      if (path && path.length - 1 <= maxSteps) {
        results.push({
          roomId: room.id,
          door,
          distance: path.length - 1,
        });
      }
    }
  }

  return results;
}

/**
 * Returns the furthest reachable position along a path, constrained by maxSteps.
 * Used to handle dice rolls that don't quite reach a room.
 */
export function walkPath(
  path: Position[],
  maxSteps: number
): Position {
  // path[0] is the starting cell; each subsequent cell costs one step
  const stepCount = Math.min(maxSteps, path.length - 1);
  return path[stepCount];
}

