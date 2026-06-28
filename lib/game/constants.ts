import type {
  DetectiveId,
  WeaponId,
  RoomConfig,
  Position,
  AIPersonality,
} from "./types";

// ============================================================
// BOARD DIMENSIONS
// ============================================================

export const BOARD_SIZE = 12;

// ============================================================
// WEAPONS
// ============================================================

export const WEAPONS: readonly { id: WeaponId; name: string }[] = [
  { id: "PEARL_PISTOL",  name: "Pearl-handled Pistol"   },
  { id: "LETTER_OPENER", name: "Silver Letter Opener"    },
  { id: "STRYCHNINE",    name: "Vial of Strychnine"      },
  { id: "BRASS_CLOCK",   name: "Heavy Brass Clock"       },
  { id: "SILK_TIE",      name: "Silk Tie"                },
  { id: "WALKING_CANE",  name: "Polished Walking Cane"   },
] as const;

// ============================================================
// DETECTIVES
// ============================================================

export const DETECTIVES: readonly {
  id: DetectiveId;
  name: string;
  color: string;
  personality: string;
}[] = [
  {
    id: "VANCE",
    name: "Inspector Vance",
    color: "#8b5cf6",
    personality: "Cautious and methodical. Studies patterns before striking.",
  },
  {
    id: "ROSEWOOD",
    name: "Madam Rosewood",
    color: "#f43f5e",
    personality: "Aggressive and bold. Accuses early and takes calculated risks.",
  },
  {
    id: "BLACKWOOD",
    name: "Dr. Blackwood",
    color: "#06b6d4",
    personality: "Cold and statistical. Driven entirely by probability.",
  },
  {
    id: "STERLING",
    name: "Captain Sterling",
    color: "#10b981",
    personality: "Direct and fearless. Interrogates with relentless force.",
  },
  {
    id: "ASHCROFT",
    name: "Lady Ashcroft",
    color: "#f59e0b",
    personality: "Cunning and deceptive. Bluffs and misleads rivals at every turn.",
  },
] as const;

// ============================================================
// AI PERSONALITIES (system prompts for 0G Compute monologue)
// ============================================================

export const AI_PERSONALITIES: Record<DetectiveId, AIPersonality> = {
  VANCE: {
    id: "VANCE",
    name: "Inspector Vance",
    trait: "Cautious analyst",
    systemPrompt:
      "You are Inspector Vance, a seasoned detective known for patience and precision. You speak in careful, measured sentences. You observe everything before drawing a conclusion. Every word you say is deliberate. Keep responses under 25 words, in character, and do not use quotes.",
  },
  ROSEWOOD: {
    id: "ROSEWOOD",
    name: "Madam Rosewood",
    trait: "Aggressive risk-taker",
    systemPrompt:
      "You are Madam Rosewood, a bold and theatrical detective who acts fast and demands answers. You speak with sharp urgency and a hint of drama. Keep responses under 25 words, in character, and do not use quotes.",
  },
  BLACKWOOD: {
    id: "BLACKWOOD",
    name: "Dr. Blackwood",
    trait: "Probabilistic reasoner",
    systemPrompt:
      "You are Dr. Blackwood, a cold and calculating detective who treats the mystery as a probability problem. You speak in precise, unemotional language with references to evidence and likelihood. Keep responses under 25 words, in character, and do not use quotes.",
  },
  STERLING: {
    id: "STERLING",
    name: "Captain Sterling",
    trait: "Blunt interrogator",
    systemPrompt:
      "You are Captain Sterling, a tough no-nonsense detective with a military bearing. You speak in clipped, commanding sentences. You have no patience for games or evasion. Keep responses under 25 words, in character, and do not use quotes.",
  },
  ASHCROFT: {
    id: "ASHCROFT",
    name: "Lady Ashcroft",
    trait: "Cunning deceiver",
    systemPrompt:
      "You are Lady Ashcroft, a brilliant and devious detective who delights in misdirection. You speak with elegant charm while subtly misleading those around you. Keep responses under 25 words, in character, and do not use quotes.",
  },
};

// ============================================================
// STARTING POSITIONS (hallway cells on the outer ring)
// ============================================================

export const STARTING_POSITIONS: Record<DetectiveId, Position> = {
  VANCE:    { x: 3,  y: 0  },
  ROSEWOOD: { x: 8,  y: 0  },
  BLACKWOOD:{ x: 11, y: 3  }, // fixed: (11,4) was inside MASTER_BEDROOM — (11,3) is the hallway row
  STERLING: { x: 11, y: 8  },
  ASHCROFT: { x: 3,  y: 11 },
};

// ============================================================
// ROOMS — 9 rooms laid out on a 12×12 grid
//
// Layout (grid coords, 0-indexed):
//
//   [BILLIARD_ROOM]   [CONSERVATORY]   [LIBRARY]
//   [WINE_CELLAR]     [GRAND_FOYER]    [MASTER_BEDROOM]
//   [KITCHEN]         [DINING_HALL]    [SECRET_STUDY]
//
// Each room occupies a rectangular region. Hallways fill all
// remaining cells. Door positions are hallway-adjacent cells
// that border a room, used by BFS pathfinding.
// ============================================================

export const ROOMS: readonly RoomConfig[] = [
  // ── Top-left ──────────────────────────────────────────────
  {
    id: "BILLIARD_ROOM",
    name: "Billiard Room",
    minX: 0, maxX: 2, minY: 0, maxY: 2,
    doors: [{ x: 2, y: 1 }, { x: 1, y: 2 }],
    center: { x: 1, y: 1 },
  },
  // ── Top-centre ────────────────────────────────────────────
  {
    id: "CONSERVATORY",
    name: "Conservatory",
    minX: 4, maxX: 7, minY: 0, maxY: 2,
    doors: [{ x: 4, y: 2 }, { x: 7, y: 2 }],
    center: { x: 5, y: 1 },
  },
  // ── Top-right ─────────────────────────────────────────────
  {
    id: "LIBRARY",
    name: "Library",
    minX: 9, maxX: 11, minY: 0, maxY: 2,
    doors: [{ x: 9, y: 1 }, { x: 10, y: 2 }],
    center: { x: 10, y: 1 },
  },
  // ── Mid-left ──────────────────────────────────────────────
  {
    id: "WINE_CELLAR",
    name: "Wine Cellar",
    minX: 0, maxX: 2, minY: 4, maxY: 7,
    doors: [{ x: 2, y: 5 }, { x: 2, y: 6 }],
    center: { x: 1, y: 5 },
  },
  // ── Centre ────────────────────────────────────────────────
  {
    id: "GRAND_FOYER",
    name: "Grand Foyer",
    minX: 4, maxX: 7, minY: 4, maxY: 7,
    //
    // All 8 doors sit on the room's own boundary cells (inside minX/maxX/minY/maxY),
    // never in the open hallway. The hallway cells adjacent to each door are still
    // walkable, so agents naturally enter/exit through whichever door is closest.
    //
    doors: [
      { x: 5, y: 4 }, { x: 6, y: 4 }, // top wall    (y=4 = minY, not corners 4,4 or 7,4)
      { x: 4, y: 5 }, { x: 4, y: 6 }, // left wall   (x=4 = minX, not corners 4,4 or 4,7)
      { x: 7, y: 5 }, { x: 7, y: 6 }, // right wall  (x=7 = maxX, not corners 7,4 or 7,7)
      { x: 5, y: 7 }, { x: 6, y: 7 }, // bottom wall (y=7 = maxY, not corners 4,7 or 7,7)
    ],
    center: { x: 5, y: 5 },
  },
  // ── Mid-right ─────────────────────────────────────────────
  {
    id: "MASTER_BEDROOM",
    name: "Master Bedroom",
    minX: 9, maxX: 11, minY: 4, maxY: 7,
    doors: [{ x: 9, y: 5 }, { x: 9, y: 6 }],
    center: { x: 10, y: 5 },
  },
  // ── Bottom-left ───────────────────────────────────────────
  {
    id: "KITCHEN",
    name: "Kitchen",
    minX: 0, maxX: 2, minY: 9, maxY: 11,
    doors: [{ x: 1, y: 9 }, { x: 2, y: 10 }],
    center: { x: 1, y: 10 },
  },
  // ── Bottom-centre ─────────────────────────────────────────
  {
    id: "DINING_HALL",
    name: "Dining Hall",
    minX: 4, maxX: 7, minY: 9, maxY: 11,
    doors: [{ x: 4, y: 9 }, { x: 7, y: 9 }],
    center: { x: 5, y: 10 },
  },
  // ── Bottom-right ──────────────────────────────────────────
  {
    id: "SECRET_STUDY",
    name: "Secret Study",
    minX: 9, maxX: 11, minY: 9, maxY: 11,
    doors: [{ x: 9, y: 10 }, { x: 10, y: 9 }],
    center: { x: 10, y: 10 },
  },
] as const;

// ============================================================
// LOOKUP HELPERS (pre-built for O(1) access)
// ============================================================

export const ROOM_BY_ID = Object.fromEntries(
  ROOMS.map((r) => [r.id, r])
) as Record<string, RoomConfig>;

export const DETECTIVE_BY_ID = Object.fromEntries(
  DETECTIVES.map((d) => [d.id, d])
) as Record<string, (typeof DETECTIVES)[number]>;

export const WEAPON_BY_ID = Object.fromEntries(
  WEAPONS.map((w) => [w.id, w])
) as Record<string, (typeof WEAPONS)[number]>;
