// ============================================================
// DOMAIN PRIMITIVES — identifiers used across all game modules
// ============================================================

export type DetectiveId =
  | "VANCE"
  | "ROSEWOOD"
  | "BLACKWOOD"
  | "STERLING"
  | "ASHCROFT";

export type WeaponId =
  | "PEARL_PISTOL"
  | "LETTER_OPENER"
  | "STRYCHNINE"
  | "BRASS_CLOCK"
  | "SILK_TIE"
  | "WALKING_CANE";

export type RoomId =
  | "GRAND_FOYER"
  | "BILLIARD_ROOM"
  | "CONSERVATORY"
  | "LIBRARY"
  | "WINE_CELLAR"
  | "MASTER_BEDROOM"
  | "KITCHEN"
  | "DINING_HALL"
  | "SECRET_STUDY";

export type CardType = "detective" | "weapon" | "room";

// ============================================================
// CARD SYSTEM
// ============================================================

export interface Card {
  readonly type: CardType;
  readonly id: string; // Narrows to DetectiveId | WeaponId | RoomId at runtime
  readonly name: string;
}

export interface Envelope {
  readonly suspect: DetectiveId;
  readonly weapon: WeaponId;
  readonly room: RoomId;
}

export interface Suggestion {
  readonly suspect: DetectiveId;
  readonly weapon: WeaponId;
  readonly room: RoomId;
}

// ============================================================
// BOARD GEOMETRY
// ============================================================

export interface Position {
  readonly x: number;
  readonly y: number;
}

export type CellType = "wall" | "hallway" | "door" | "room_center";

export interface RoomConfig {
  readonly id: RoomId;
  readonly name: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly doors: readonly Position[];
  readonly center: Position;
}

// ============================================================
// DETECTIVE (PLAYER) STATE
// ============================================================

export interface DetectiveState {
  readonly id: DetectiveId;
  readonly name: string;
  readonly color: string;
  position: Position; // Mutable — moves each turn
  currentRoom: RoomId | null; // Null when in a hallway
  cards: Card[]; // The hand dealt at game start
  publicKey: string; // RSA-OAEP public key (serialised JWK)
  eliminated: boolean; // True after a wrong accusation
}

// ============================================================
// DEDUCTION NOTEBOOK
// ============================================================

/** What a detective currently believes about a given card. */
export type NotebookStatus =
  | "POSSIBLE"        // Not yet ruled out
  | "ELIMINATED"      // Confirmed not in the envelope
  | "HELD_BY_ME"      // This detective holds it in their hand
  | "HELD_BY_OTHER";  // Confirmed held by a rival (but not the envelope)

export interface DeductionNotebook {
  suspects: Record<DetectiveId, NotebookStatus>;
  weapons: Record<WeaponId, NotebookStatus>;
  rooms: Record<RoomId, NotebookStatus>;
}

// ============================================================
// TURN STATE MACHINE
// ============================================================

/**
 * The discrete states a single turn passes through.
 * idle → rolling → moving → suggesting → disproving → accusing → next_turn_pending
 */
export type GameActionState =
  | "idle"
  | "rolling"
  | "moving"
  | "suggesting"
  | "disproving"
  | "accusing"
  | "next_turn_pending";

export type GameStatus = "initializing" | "playing" | "finished";

// ============================================================
// AI AGENT PERSONALITY
// ============================================================

export interface AIPersonality {
  readonly id: DetectiveId;
  readonly name: string;
  readonly trait: string;
  /** Full system prompt fed to 0G Compute for monologue generation */
  readonly systemPrompt: string;
}

export interface CustomDetectiveConfig {
  readonly targetAgentId: DetectiveId;
  readonly customName: string;
  readonly personalityPrompt: string;
  readonly movementStyle: "METHODICAL" | "AGGRESSIVE" | "INTERROGATOR" | "BLUFFER";
  readonly bluffRate: number;
  readonly accusationRiskLimit: number;
}

// ============================================================
// EVENT LOG
// ============================================================

export interface LogEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly agentId: DetectiveId | "SYSTEM";
  readonly action: string;
  readonly details: string;
  readonly isEncrypted: boolean;
  readonly rootHash?: string; // 0G Storage root hash if persisted
  readonly txHash?: string;   // 0G Chain tx hash if recorded on-chain
  readonly txSeq?: number;    // 0G Storage tx sequence number
  readonly suggestion?: Suggestion;
  readonly revealedCard?: Card;
}

// ============================================================
// 0G PERSISTENCE TYPES
// ============================================================

/** A record of a 0G Storage upload for the UI ledger panel */
export interface StorageTx {
  readonly label: string;    // Human-readable description
  readonly rootHash: string;
  readonly timestamp: number;
}

/** A record of a 0G Chain transaction for the UI ledger panel */
export interface ChainTx {
  readonly label: string;
  readonly txHash: string;
  readonly status: "pending" | "success" | "error";
  readonly timestamp: number;
  readonly error?: string;
}

// ============================================================
// GAME SESSION
// ============================================================

export interface GameSession {
  readonly id: string;
  readonly createdAt: number;
  status: GameStatus;
  winner: DetectiveId | null;
}

// ============================================================
// SERIALISED KEY PAIR (Web Crypto / RSA-OAEP)
// ============================================================

export interface KeyPairSerialized {
  readonly publicKey: string;   // JSON-serialised JWK
  readonly privateKey: string;  // JSON-serialised JWK (kept in-memory only)
}

// ============================================================
// ENCRYPTED CLUE PAYLOAD (anti-brute-force structured envelope)
// ============================================================

/**
 * The plaintext object that gets encrypted before uploading to 0G Storage.
 * Wrapping a card name in a full contextual payload prevents brute-forcing
 * the ciphertext against a small known-value set.
 */
export interface EncryptedCluePayload {
  readonly gameId: string;
  readonly round: number;
  readonly revealingAgentId: DetectiveId;
  readonly receivingAgentId: DetectiveId;
  readonly cardType: CardType;
  readonly cardId: string;
  readonly cardName: string;
  readonly timestamp: string;
  readonly nonce: string; // Random hex to prevent identical ciphertexts
}
