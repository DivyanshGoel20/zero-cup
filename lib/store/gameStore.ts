import { create } from "zustand";
import type {
  DetectiveId,
  WeaponId,
  RoomId,
  DetectiveState,
  Card,
  Envelope,
  DeductionNotebook,
  GameActionState,
  GameStatus,
  LogEntry,
  Suggestion,
  Position,
  CustomDetectiveConfig,
} from "@/lib/game/types";
import {
  DETECTIVES,
  DETECTIVE_BY_ID,
  STARTING_POSITIONS,
  ROOMS,
  ROOM_BY_ID,
} from "@/lib/game/constants";
import {
  setupDeck,
  rollDice,
  processSuggestion,
  checkAccusation,
  createEmptyNotebook,
} from "@/lib/game/engine";
import {
  updateNotebookFromReveal,
  updateNotebookFromNoDisproval,
  runDeductionAnalysis,
  calculateConfidence,
  checkAIAccusationDecision,
} from "@/lib/game/deduction";
import { findPath, getReachableDoors, walkPath, getRoomAt, walkFullSteps } from "@/lib/game/board";
import { getAddressFromPrivateKey } from "@/lib/zeroG/chain";

// ============================================================
// STORE SHAPE
// ============================================================

export interface GameState {
  // Game lifecycle
  status: GameStatus;
  gameId: string;
  round: number;
  turn: number;

  // Turn machine
  currentDetectiveIndex: number;
  actionState: GameActionState;

  // Dice
  diceRoll: number | null;

  // Detectives
  detectives: DetectiveState[];
  detectiveOrder: DetectiveId[];

  // Cards
  envelope: Envelope | null;
  hands: Record<DetectiveId, Card[]>;

  // Active movement path being animated
  movementPath: Position[];
  movementStep: number;

  // Deduction notebooks (one per detective)
  notebooks: Record<DetectiveId, DeductionNotebook>;

  // Confidence (0–1) per detective
  confidence: Record<DetectiveId, number>;

  // Pending suggestion waiting for disproval
  pendingSuggestion: Suggestion | null;

  // Event log
  log: LogEntry[];

  // Winner
  winner: DetectiveId | null;

  // AI monologue
  activeMonologue: string | null;
  isThinking: boolean;

  // 0G Sync states
  isSyncing: boolean;
  syncMessage: string | null;
  error: string | null;
  derivedAddress: string;
  privateKeys: Record<DetectiveId, string>;

  // Human player state
  humanDetectiveId: DetectiveId | null;
  sessionPrivateKey: string | null;
  disprovalPending: {
    suggesterId: DetectiveId;
    suggestion: Suggestion;
    disproverId: DetectiveId;
    candidates: Card[];
  } | null;
  customDetective: CustomDetectiveConfig | null;
}

export interface GameActions {
  initGame: (selectedHumanId?: DetectiveId | null, customConfig?: CustomDetectiveConfig | null) => Promise<void>;
  rollDiceAction: () => Promise<void>;
  stepMovement: () => void;
  moveHumanAction: (targetPos: Position) => void;
  makeSuggestion: () => Promise<void>;
  makeHumanSuggestion: (suggestion: Suggestion) => Promise<void>;
  resolveHumanDisproval: (card: Card) => Promise<void>;
  makeAccusation: (accusation: Suggestion) => Promise<void>;
  advanceTurn: () => void;
  addLog: (
    agentId: DetectiveId | "SYSTEM",
    action: string,
    details: string,
    txHash?: string,
    rootHash?: string,
    txSeq?: number
  ) => void;
  fetchAIMonologue: (agentId: DetectiveId, context: string, action: string) => Promise<void>;
}

// ============================================================
// HELPERS
// ============================================================

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

const ALL_DETECTIVE_IDS: DetectiveId[] = DETECTIVES.map((d) => d.id);

// ============================================================
// INITIAL STATE
// ============================================================

const DERIVED_WALLET_ADDRESS = getAddressFromPrivateKey(process.env.NEXT_PUBLIC_DEFAULT_PRIVATE_KEY || "");

const INITIAL_STATE: GameState = {
  status: "initializing",
  gameId: "",
  round: 0,
  turn: 0,
  currentDetectiveIndex: 0,
  actionState: "idle",
  diceRoll: null,
  detectives: [],
  detectiveOrder: ALL_DETECTIVE_IDS,
  envelope: null,
  hands: {} as Record<DetectiveId, Card[]>,
  movementPath: [],
  movementStep: 0,
  notebooks: {} as Record<DetectiveId, DeductionNotebook>,
  confidence: {} as Record<DetectiveId, number>,
  pendingSuggestion: null,
  log: [],
  winner: null,
  activeMonologue: null,
  isThinking: false,
  isSyncing: false,
  syncMessage: null,
  error: null,
  derivedAddress: DERIVED_WALLET_ADDRESS,
  privateKeys: {} as Record<DetectiveId, string>,
  humanDetectiveId: null,
  sessionPrivateKey: null,
  disprovalPending: null,
  customDetective: null,
};

// ============================================================
// LOCAL MONOLOGUES (0G COMPUTE REDUCTION)
// ============================================================

const ROLL_PHRASES: Record<DetectiveId, string[]> = {
  VANCE: [
    "Every step must be calculated. The layout of this hallway suggests a pattern.",
    "Methodical search is the key. Let's see where the dice take me.",
    "Patience, Vance. The clues are scattered, but they will form a line.",
    "A quiet house hides loud secrets. Let's move cautiously."
  ],
  ROSEWOOD: [
    "No time to waste! I need to get into a room and demand answers.",
    "The killer is playing with us. Let's speed up the pace!",
    "A bold move is better than sitting still. Show me the numbers!",
    "I will corner them eventually. Let's search every corner."
  ],
  BLACKWOOD: [
    "Statistically, the center rooms have higher probability density. Moving.",
    "The variance of a 1-6 roll is high, but the expectation is 3.5. Let's proceed.",
    "Deduction is a process of elimination. Calculating optimal path.",
    "Evaluating probability distribution of the secret cards based on active locations."
  ],
  STERLING: [
    "Relentless pressure. I will inspect every sector of this house.",
    "No evasion will work. I'm marching straight to the next room.",
    "Double-quick time. Let's find out who's hiding the facts.",
    "The truth doesn't bend. I will extract it step by step."
  ],
  ASHCROFT: [
    "Let them think they are ahead. Misdirection is my best ally.",
    "A lovely day for a mystery... and a few little lies.",
    "I'll show them a path, but walk another. Let's see.",
    "They are watching me. Good, let them watch the wrong hand."
  ]
};

function getLocalRollMonologue(agentId: DetectiveId): string {
  const phrases = ROLL_PHRASES[agentId] || ["Searching..."];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================================
// CLOCKWISE DISPROVAL SEARCH
// ============================================================

function findDisproverClockwise(
  suggestion: Suggestion,
  suggesterId: DetectiveId,
  detectiveOrder: DetectiveId[],
  hands: Record<DetectiveId, Card[]>,
  detectives: DetectiveState[]
): { disproverId: DetectiveId; matchingCards: Card[] } | null {
  const suggesterIndex = detectiveOrder.indexOf(suggesterId);

  for (let i = 1; i < detectiveOrder.length; i++) {
    const candidateId = detectiveOrder[(suggesterIndex + i) % detectiveOrder.length];
    
    // Skip if eliminated
    const det = detectives.find(d => d.id === candidateId);
    if (det?.eliminated) continue;

    const hand = hands[candidateId] ?? [];
    const matchingCards = hand.filter(
      (c) =>
        c.id === suggestion.suspect ||
        c.id === suggestion.weapon ||
        c.id === suggestion.room
    );

    if (matchingCards.length > 0) {
      return { disproverId: candidateId, matchingCards };
    }
  }

  return null;
}

// ============================================================
// STORE
// ============================================================

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  ...INITIAL_STATE,

  // ── Init ─────────────────────────────────────────────────
  // ── Init ─────────────────────────────────────────────────
  initGame: async (selectedHumanId: DetectiveId | null = null, customConfig: CustomDetectiveConfig | null = null) => {
    const gameId = makeId();
    const detectiveIds = ALL_DETECTIVE_IDS;
    const { envelope, hands } = setupDeck(detectiveIds);

    set({
      isSyncing: true,
      syncMessage: "Generating RSA key pairs for AI detectives...",
      error: null,
    });

    try {
      const { generateKeyPair, encryptPayload } = await import("@/lib/crypto/hybrid");
      const sessionKeys = await generateKeyPair();
      const privateKeys: Record<DetectiveId, string> = {} as Record<DetectiveId, string>;
      const detectives: DetectiveState[] = await Promise.all(
        DETECTIVES.map(async (d) => {
          const keys = await generateKeyPair();
          privateKeys[d.id] = keys.privateKey;
          const isCustom = customConfig !== null && customConfig.targetAgentId === d.id;
          return {
            id: d.id,
            name: isCustom ? customConfig.customName : d.name,
            color: d.color,
            position: { ...STARTING_POSITIONS[d.id] },
            currentRoom: null,
            cards: hands[d.id],
            publicKey: keys.publicKey,
            eliminated: false,
          };
        })
      );

      set({ syncMessage: "Dealing cards and shuffling Enigma deck..." });
      await new Promise((resolve) => setTimeout(resolve, 800));

      const notebooks: Record<DetectiveId, DeductionNotebook> = {} as Record<DetectiveId, DeductionNotebook>;
      const confidence: Record<DetectiveId, number> = {} as Record<DetectiveId, number>;
      for (const det of detectives) {
        notebooks[det.id] = createEmptyNotebook(det.cards);
        confidence[det.id] = 0;
      }

      const initLog: LogEntry = {
        id: makeId(),
        timestamp: Date.now(),
        agentId: "SYSTEM",
        action: "GAME_START",
        details: selectedHumanId
          ? `Enigma begins. Game ID: ${gameId}. Human playing as ${DETECTIVE_BY_ID[selectedHumanId]?.name}.`
          : `Enigma begins. Game ID: ${gameId}. Spectator mode (5 AI detectives).`,
        isEncrypted: false,
      };

      set({ syncMessage: "Encrypting and uploading sealed case files to 0G Storage..." });
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Encrypt the envelope using session public key
      const encryptedEnvelope = await encryptPayload(envelope, sessionKeys.publicKey);

      // Encrypt each player's hand using their public key
      const encryptedHands: Record<DetectiveId, string> = {} as Record<DetectiveId, string>;
      for (const det of detectives) {
        encryptedHands[det.id] = await encryptPayload(hands[det.id], det.publicKey);
      }

      // Upload encrypted game setup to 0G Storage
      const res = await fetch("/api/storage/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: `setup-${gameId}`,
          data: { encryptedEnvelope, encryptedHands },
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.ok) {
        throw new Error(resData.error || `Failed to upload setup to 0G Storage: HTTP ${res.status}`);
      }

      const uploadLog: LogEntry = {
        id: makeId(),
        timestamp: Date.now(),
        agentId: "SYSTEM",
        action: "STORAGE_UPLOAD",
        details: `Sealed case envelope and hands encrypted & stored securely on 0G Storage (anti-brute-force ciphertexts).`,
        isEncrypted: true,
        rootHash: resData.rootHash,
        txSeq: resData.txSeq,
      };

      set({ syncMessage: "Anchoring game setup registry onto the 0G Chain..." });
      await new Promise((resolve) => setTimeout(resolve, 800));

      set({
        ...INITIAL_STATE,
        status: "playing",
        gameId,
        round: 1,
        turn: 1,
        currentDetectiveIndex: 0,
        actionState: "idle",
        detectives,
        privateKeys,
        detectiveOrder: detectiveIds,
        envelope,
        hands,
        notebooks,
        confidence,
        log: [initLog, uploadLog],
        isSyncing: false,
        syncMessage: null,
        error: null,
        humanDetectiveId: selectedHumanId,
        sessionPrivateKey: sessionKeys.privateKey,
        customDetective: customConfig,
      });
    } catch (err: any) {
      console.error("[0G Init] Initial setup failed:", err);
      let errMsg: string = err?.message || String(err);
      if (errMsg.includes("REPLACEMENT_UNDERPRICED") || errMsg.includes("replacement fee too low") || errMsg.includes("replacement transaction underpriced")) {
        errMsg = "A prior transaction is still pending in the mempool. Please wait a few seconds and click \"Begin Investigation\" again to retry.";
      }
      set({
        isSyncing: false,
        syncMessage: null,
        error: errMsg,
      });
    }
  },

  // ── Dice ─────────────────────────────────────────────────
  rollDiceAction: async () => {
    const { actionState, currentDetectiveIndex, detectives, detectiveOrder, gameId, round, turn, humanDetectiveId, notebooks, customDetective } = get();
    if (actionState !== "idle") return;

    set({
      isSyncing: true,
      syncMessage: "Anchoring dice roll to 0G Galileo blockchain...",
      error: null,
    });

    try {
      const roll = rollDice();
      const activeId = detectiveOrder[currentDetectiveIndex];
      const detective = detectives.find((d) => d.id === activeId)!;

      // 1. Anchor dice roll to 0G Chain
      const chainRes = await fetch("/api/chain/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DICE_ROLL",
          data: { gameId, round, turn, detective: activeId, roll },
        }),
      });
      const chainData = await chainRes.json();
      if (!chainRes.ok || !chainData.ok) {
        throw new Error(chainData.error || `Failed to record dice roll on 0G Chain: HTTP ${chainRes.status}`);
      }

      if (activeId === humanDetectiveId) {
        // Human rolls, wait for manual path click destination
        set({
          diceRoll: roll,
          actionState: "moving",
          movementPath: [],
          movementStep: 0,
          isSyncing: false,
          syncMessage: null,
        });

        get().addLog(
          activeId,
          "ROLL",
          `Rolled a ${roll}. Select a highlighted cell on the board to move.`,
          chainData.txHash
        );
        return;
      }

      // Build a set of cells occupied by OTHER living agents so we never
      // plan a path that ends with two agents on the same square.
      const occupiedCells = new Set<string>(
        detectives
          .filter((d) => d.id !== activeId && !d.eliminated)
          .map((d) => `${d.position.x},${d.position.y}`)
      );

      // Compute paths to doors of OTHER rooms.
      // Only include doors that are (a) not occupied and (b) reachable within the dice roll.
      const currentRoomId = detective.currentRoom;
      const candidatePaths: { roomId: RoomId; door: Position; distance: number; path: Position[]; score?: number }[] = [];
      for (const room of ROOMS) {
        if (room.id === currentRoomId) continue;
        for (const door of room.doors) {
          // Skip doors occupied by another agent
          if (occupiedCells.has(`${door.x},${door.y}`)) continue;
          const p = findPath(detective.position, door);
          if (p && p.length > 1) {
            const dist = p.length - 1;
            // Only consider rooms we can actually reach within the roll
            if (dist <= roll) {
              candidatePaths.push({
                roomId: room.id as RoomId,
                door,
                distance: dist,
                path: p,
              });
            }
          }
        }
      }

      let chosenPathInfo: typeof candidatePaths[number] | null = null;
      let decisionReasoning = "";

      const notebook = notebooks[activeId];
      let style: "VANCE" | "ROSEWOOD" | "BLACKWOOD" | "STERLING" | "ASHCROFT" = activeId;
      if (customDetective && customDetective.targetAgentId === activeId) {
        if (customDetective.movementStyle === "METHODICAL") style = "VANCE";
        else if (customDetective.movementStyle === "AGGRESSIVE") style = "ROSEWOOD";
        else if (customDetective.movementStyle === "INTERROGATOR") style = "STERLING";
        else if (customDetective.movementStyle === "BLUFFER") style = "ASHCROFT";
      }

      if (style === "VANCE" && notebook) {
        // Vance (Cautious Analyst): Methodically targets rooms that are still POSSIBLE in his notebook.
        const unruledOutCandidates = candidatePaths.filter(
          (c) => notebook.rooms[c.roomId] === "POSSIBLE"
        );
        if (unruledOutCandidates.length > 0) {
          unruledOutCandidates.sort((a, b) => a.distance - b.distance);
          chosenPathInfo = unruledOutCandidates[0];
          decisionReasoning = `methodically targets the unvisited ${ROOM_BY_ID[chosenPathInfo.roomId]?.name || chosenPathInfo.roomId} to gather new evidence.`;
        } else if (candidatePaths.length > 0) {
          candidatePaths.sort((a, b) => a.distance - b.distance);
          chosenPathInfo = candidatePaths[0];
          decisionReasoning = `has visited all candidate rooms. Targetting closest room ${ROOM_BY_ID[chosenPathInfo.roomId]?.name || chosenPathInfo.roomId} as fallback.`;
        }
      } else if (style === "BLACKWOOD" && notebook) {
        // Blackwood (Probabilistic Reasoner): Calculates a score for each room: (unruled suspects + unruled weapons + room weight) / distance.
        const scoredCandidates = candidatePaths.map((c) => {
          const possibleSuspectsCount = (Object.keys(notebook.suspects) as DetectiveId[]).filter(
            (id) => notebook.suspects[id] === "POSSIBLE"
          ).length;
          const possibleWeaponsCount = (Object.keys(notebook.weapons) as WeaponId[]).filter(
            (id) => notebook.weapons[id] === "POSSIBLE"
          ).length;
          const roomStatus = notebook.rooms[c.roomId];
          const roomWeight = roomStatus === "POSSIBLE" ? 3 : 1;
          const score = (possibleSuspectsCount + possibleWeaponsCount + roomWeight) / (c.distance || 1);
          return { ...c, score };
        });

        if (scoredCandidates.length > 0) {
          scoredCandidates.sort((a, b) => b.score - a.score);
          chosenPathInfo = scoredCandidates[0];
          decisionReasoning = `calculates high information gain for ${ROOM_BY_ID[chosenPathInfo.roomId]?.name || chosenPathInfo.roomId} (probability density score: ${(chosenPathInfo.score ?? 0).toFixed(1)}).`;
        } else if (candidatePaths.length > 0) {
          candidatePaths.sort((a, b) => a.distance - b.distance);
          chosenPathInfo = candidatePaths[0];
          decisionReasoning = `targets closest room ${ROOM_BY_ID[chosenPathInfo.roomId]?.name || chosenPathInfo.roomId} to maintain efficiency.`;
        }
      } else if (style === "STERLING") {
        // Sterling (Blunt Interrogator): Target rooms containing other active detectives, to interrogate them.
        const detectivesInRooms = detectives.filter((d) => d.id !== activeId && d.currentRoom && !d.eliminated);
        const roomToDetCount: Record<string, number> = {};
        detectivesInRooms.forEach((d) => {
          if (d.currentRoom) {
            roomToDetCount[d.currentRoom] = (roomToDetCount[d.currentRoom] || 0) + 1;
          }
        });

        const sortedInterrogateCandidates = candidatePaths.map((c) => {
          const detCount = roomToDetCount[c.roomId] || 0;
          // Priority to rooms with detectives, secondary to distance
          const score = detCount * 10 - c.distance;
          return { ...c, score };
        });

        if (sortedInterrogateCandidates.length > 0) {
          sortedInterrogateCandidates.sort((a, b) => b.score - a.score);
          chosenPathInfo = sortedInterrogateCandidates[0];
          const targetDetCount = roomToDetCount[chosenPathInfo.roomId] || 0;
          if (targetDetCount > 0) {
            decisionReasoning = `bluntly marches to the ${ROOM_BY_ID[chosenPathInfo.roomId]?.name || chosenPathInfo.roomId} to confront and interrogate suspect(s).`;
          } else {
            decisionReasoning = `targets the closest room ${ROOM_BY_ID[chosenPathInfo.roomId]?.name || chosenPathInfo.roomId} for direct inspection.`;
          }
        } else if (candidatePaths.length > 0) {
          candidatePaths.sort((a, b) => a.distance - b.distance);
          chosenPathInfo = candidatePaths[0];
          decisionReasoning = `targets closest room ${ROOM_BY_ID[chosenPathInfo.roomId]?.name || chosenPathInfo.roomId} as fallback.`;
        }
      } else if (style === "ASHCROFT" && notebook) {
        // Ashcroft (Cunning Deceiver): 40% chance to target an already ruled-out room as a bluff to confuse opponents.
        const ruledOutRooms = candidatePaths.filter(
          (c) => notebook.rooms[c.roomId] !== "POSSIBLE"
        );
        const randVal = Math.random();
        if (randVal < 0.4 && ruledOutRooms.length > 0) {
          ruledOutRooms.sort((a, b) => a.distance - b.distance);
          chosenPathInfo = ruledOutRooms[0];
          decisionReasoning = `deliberately targets the ruled-out ${ROOM_BY_ID[chosenPathInfo.roomId]?.name || chosenPathInfo.roomId} to mislead rivals.`;
        } else {
          const unruledOutCandidates = candidatePaths.filter(
            (c) => notebook.rooms[c.roomId] === "POSSIBLE"
          );
          if (unruledOutCandidates.length > 0) {
            unruledOutCandidates.sort((a, b) => a.distance - b.distance);
            chosenPathInfo = unruledOutCandidates[0];
            decisionReasoning = `cunningly targets ${ROOM_BY_ID[chosenPathInfo.roomId]?.name || chosenPathInfo.roomId} to extract key clues.`;
          } else if (candidatePaths.length > 0) {
            candidatePaths.sort((a, b) => a.distance - b.distance);
            chosenPathInfo = candidatePaths[0];
            decisionReasoning = `targets closest room ${ROOM_BY_ID[chosenPathInfo.roomId]?.name || chosenPathInfo.roomId} as fallback.`;
          }
        }
      } else {
        // Rosewood (Aggressive risk-taker) and default fallback
        // 30% chance to pick the second closest room if available to cover more ground.
        if (candidatePaths.length > 0) {
          candidatePaths.sort((a, b) => a.distance - b.distance);
          if (candidatePaths.length > 1 && Math.random() < 0.3) {
            chosenPathInfo = candidatePaths[1];
            decisionReasoning = `audaciously bypasses the closest room to target the ${ROOM_BY_ID[chosenPathInfo.roomId]?.name || chosenPathInfo.roomId}.`;
          } else {
            chosenPathInfo = candidatePaths[0];
            decisionReasoning = `aggressively sprints to the closest room, the ${ROOM_BY_ID[chosenPathInfo.roomId]?.name || chosenPathInfo.roomId}.`;
          }
        }
      }

      let finalPath: Position[];

      if (chosenPathInfo) {
        // A reachable room was found within the dice roll.
        // Truncate the path to exactly `roll` steps (entering a room terminates movement,
        // per Cluedo rules any remaining steps after entering a room are forfeit).
        finalPath = chosenPathInfo.path.slice(0, roll + 1);
      } else {
        // No room is reachable within this dice roll — the agent must spend ALL roll steps
        // walking the hallway (bouncing back-and-forth at dead-ends).
        decisionReasoning = decisionReasoning || `no room reachable in ${roll} steps — pacing the hallway to use all moves.`;
        finalPath = walkFullSteps(detective.position, roll, occupiedCells);
      }

      // 2. Upload movement path metadata to 0G Storage
      const storageRes = await fetch("/api/storage/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: `move-${gameId}-${round}-${turn}`,
          data: { detective: activeId, roll, path: finalPath },
        }),
      });
      const storageData = await storageRes.json();
      if (!storageRes.ok || !storageData.ok) {
        throw new Error(storageData.error || `Failed to upload movement to 0G Storage: HTTP ${storageRes.status}`);
      }

      // For AI: set local roll monologue (combines monologue to avoid calling LLM)
      const mono = getLocalRollMonologue(activeId);
      set({
        diceRoll: roll,
        actionState: "moving",
        movementPath: finalPath,
        movementStep: 0,
        isSyncing: false,
        syncMessage: null,
        activeMonologue: mono,
      });

      if (decisionReasoning && humanDetectiveId === null) {
        get().addLog(activeId, "THINK", `[Strategy] ${detective.name} ${decisionReasoning}`);
      }
      get().addLog(activeId, "THINK", mono);

      get().addLog(
        activeId,
        "ROLL",
        `Rolled a ${roll}. Moving ${finalPath.length - 1} step(s).`,
        chainData.txHash,
        storageData.rootHash,
        storageData.txSeq
      );
    } catch (err: any) {
      console.error("[0G Move] Dice roll sync failed:", err);
      set({
        isSyncing: false,
        syncMessage: null,
        error: err?.message || String(err),
      });
    }
  },

  // ── Step movement (called per animation frame / tick) ────
  stepMovement: () => {
    const { movementPath, movementStep, currentDetectiveIndex, detectiveOrder, detectives, actionState } = get();
    if (actionState !== "moving" || movementPath.length === 0) return;

    const nextStep = movementStep + 1;

    if (nextStep >= movementPath.length) {
      // Movement complete — land on the final cell
      const finalPos = movementPath[movementPath.length - 1];
      const activeId = detectiveOrder[currentDetectiveIndex];
      const roomId = getRoomAt(finalPos.x, finalPos.y);

      const updatedDetectives = detectives.map((d) =>
        d.id === activeId
          ? { ...d, position: finalPos, currentRoom: roomId }
          : d
      );

      const nextState: GameActionState = roomId ? "suggesting" : "next_turn_pending";

      set({
        detectives: updatedDetectives,
        movementStep: nextStep,
        actionState: nextState,
      });

      if (roomId) {
        get().addLog(activeId, "ENTER_ROOM", `Entered the ${roomId.replace(/_/g, " ")}.`);
      }
      return;
    }

    // Advance one step
    const pos = movementPath[nextStep];
    const activeId = detectiveOrder[currentDetectiveIndex];

    const updatedDetectives = detectives.map((d) =>
      d.id === activeId ? { ...d, position: pos } : d
    );

    set({ movementStep: nextStep, detectives: updatedDetectives });
  },

  // ── Human Action: Click to move ─────────────────────────
  moveHumanAction: async (targetPos: Position) => {
    const { actionState, currentDetectiveIndex, detectives, detectiveOrder, diceRoll, gameId, round, turn, humanDetectiveId } = get();
    const activeId = detectiveOrder[currentDetectiveIndex];
    if (activeId !== humanDetectiveId || actionState !== "moving" || diceRoll === null) return;

    const detective = detectives.find((d) => d.id === activeId)!;

    // Find path
    const path = findPath(detective.position, targetPos);
    if (!path || path.length === 0 || path.length - 1 > diceRoll) {
      // Too far or unreachable
      return;
    }

    set({
      isSyncing: true,
      syncMessage: "Uploading movement details to 0G Storage...",
      error: null,
    });

    try {
      // Upload movement path metadata to 0G Storage
      const storageRes = await fetch("/api/storage/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: `move-${gameId}-${round}-${turn}`,
          data: { detective: activeId, roll: diceRoll, path },
        }),
      });
      const storageData = await storageRes.json();
      if (!storageRes.ok || !storageData.ok) {
        throw new Error(storageData.error || `Failed to upload movement to 0G Storage: HTTP ${storageRes.status}`);
      }

      set({
        movementPath: path,
        movementStep: 0,
        isSyncing: false,
        syncMessage: null,
      });

      get().addLog(
        activeId,
        "MOVE",
        `Decided to walk to cell (${targetPos.x}, ${targetPos.y}).`,
        undefined,
        storageData.rootHash,
        storageData.txSeq
      );
    } catch (err: any) {
      console.error("[Human Move] Storage upload failed:", err);
      set({
        isSyncing: false,
        syncMessage: null,
        error: err?.message || String(err),
      });
    }
  },

  // ── AI Suggestion ───────────────────────────────────────────
  makeSuggestion: async () => {
    const { currentDetectiveIndex, detectiveOrder, detectives, hands, notebooks, confidence, gameId, round, turn, humanDetectiveId, customDetective } = get();
    const activeId = detectiveOrder[currentDetectiveIndex];
    const detective = detectives.find((d) => d.id === activeId)!;
    const notebook = notebooks[activeId];

    if (!detective.currentRoom || !notebook) {
      throw new Error("Cannot suggest: detective is not inside a room or notebook is missing.");
    }

    set({
      isSyncing: true,
      syncMessage: `Consulting Qwen model for ${detective.name}'s suggestion & monologue...`,
      error: null,
    });

    try {
      const possibleSuspects = (Object.keys(notebook.suspects) as DetectiveId[]).filter(
        (id) => notebook.suspects[id] === "POSSIBLE"
      );
      const possibleWeapons = (Object.keys(notebook.weapons) as WeaponId[]).filter(
        (id) => notebook.weapons[id] === "POSSIBLE"
      );

      let suspectsForSuggestion = [...possibleSuspects];
      let weaponsForSuggestion = [...possibleWeapons];
      let suggestionNotes = "";

      const heldSuspects = (Object.keys(notebook.suspects) as DetectiveId[]).filter(
        (id) => notebook.suspects[id] === "HELD_BY_ME"
      );
      const heldWeapons = (Object.keys(notebook.weapons) as WeaponId[]).filter(
        (id) => notebook.weapons[id] === "HELD_BY_ME"
      );

      const eliminatedSuspects = (Object.keys(notebook.suspects) as DetectiveId[]).filter(
        (id) => notebook.suspects[id] === "HELD_BY_OTHER" || notebook.suspects[id] === "ELIMINATED"
      );
      const eliminatedWeapons = (Object.keys(notebook.weapons) as WeaponId[]).filter(
        (id) => notebook.weapons[id] === "HELD_BY_OTHER" || notebook.weapons[id] === "ELIMINATED"
      );

      const isCustom = customDetective !== null && customDetective.targetAgentId === activeId;
      const bluffRate = isCustom ? customDetective.bluffRate : (activeId === "ASHCROFT" ? 0.5 : 0);
      const testOwnHandRate = isCustom ? 0 : (activeId === "ROSEWOOD" ? 0.3 : 0);
      const summonRival = isCustom ? (customDetective.movementStyle === "INTERROGATOR") : (activeId === "STERLING");

      if (bluffRate > 0) {
        if (Math.random() < bluffRate) {
          const pool = [...heldSuspects, ...eliminatedSuspects];
          if (pool.length > 0) {
            const bluffSuspect = pool[Math.floor(Math.random() * pool.length)];
            suspectsForSuggestion = [bluffSuspect];
            suggestionNotes = "Bluff Strategy: Deliberately suggesting a ruled-out or held suspect to mislead opponents.";
          }
        }
        if (Math.random() < bluffRate) {
          const pool = [...heldWeapons, ...eliminatedWeapons];
          if (pool.length > 0) {
            const bluffWeapon = pool[Math.floor(Math.random() * pool.length)];
            weaponsForSuggestion = [bluffWeapon];
            suggestionNotes += (suggestionNotes ? " Also " : "") + "Bluff Strategy: Suggesting a ruled-out or held weapon to hide real leads.";
          }
        }
      } else if (testOwnHandRate > 0) {
        if (Math.random() < testOwnHandRate && heldSuspects.length > 0) {
          suspectsForSuggestion = [heldSuspects[Math.floor(Math.random() * heldSuspects.length)]];
          suggestionNotes = "Risk Strategy: Testing a suspect in hand to flush out other players' secrets.";
        }
        if (Math.random() < testOwnHandRate && heldWeapons.length > 0) {
          weaponsForSuggestion = [heldWeapons[Math.floor(Math.random() * heldWeapons.length)]];
          suggestionNotes += (suggestionNotes ? " Also " : "") + "Risk Strategy: Testing a weapon in hand to narrow down possibilities.";
        }
      } else if (summonRival) {
        const activeRivals = detectives.filter((d) => d.id !== activeId && !d.eliminated);
        if (activeRivals.length > 0) {
          activeRivals.sort((a, b) => {
            const distA = Math.abs(a.position.x - detective.position.x) + Math.abs(a.position.y - detective.position.y);
            const distB = Math.abs(b.position.x - detective.position.x) + Math.abs(b.position.y - detective.position.y);
            return distA - distB;
          });
          const nearestRival = activeRivals[0].id;
          suspectsForSuggestion = [nearestRival];
          suggestionNotes = `Interrogation Strategy: Summons nearby suspect ${activeRivals[0].name} to report immediately for questioning.`;
        }
      }

      // Query Qwen model to choose a suspect and weapon + monologue in 1 single call
      const inferenceRes = await fetch("/api/inference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: activeId,
          context: `Candidate Suspects: [${suspectsForSuggestion.join(", ")}]\nCandidate Weapons: [${weaponsForSuggestion.join(", ")}]\nCurrent Room: ${detective.currentRoom}${suggestionNotes ? `\nStrategic Directive: ${suggestionNotes}` : ""}`,
          action: "DECIDE_SUGGESTION",
          customSystemPrompt: isCustom ? customDetective.personalityPrompt : undefined,
        }),
      });

      const inferenceData = await inferenceRes.json();
      if (!inferenceRes.ok || !inferenceData.ok || !inferenceData.decision) {
        throw new Error(inferenceData.error || `Qwen decision API failed: HTTP ${inferenceRes.status}`);
      }

      const { suspect, weapon, monologue } = inferenceData.decision;
      const finalSuspect = suspectsForSuggestion.includes(suspect) ? suspect : (suspectsForSuggestion[0] || "VANCE");
      const finalWeapon = weaponsForSuggestion.includes(weapon) ? weapon : (weaponsForSuggestion[0] || "PEARL_PISTOL");

      if (suggestionNotes && humanDetectiveId === null) {
        get().addLog(activeId, "THINK", `[Strategy] ${detective.name}: ${suggestionNotes}`);
      }

      const suggestion: Suggestion = {
        suspect: finalSuspect,
        weapon: finalWeapon,
        room: detective.currentRoom,
      };

      if (monologue) {
        set({ activeMonologue: monologue });
        get().addLog(activeId, "THINK", monologue);
      }

      set({ syncMessage: "Resolving suggestion disproval..." });

      // Move the suspected detective to this room's center coordinate
      const roomConfig = ROOM_BY_ID[suggestion.room];
      const updatedDetectives = detectives.map((d) => {
        if (d.id === finalSuspect) {
          return {
            ...d,
            position: { ...roomConfig.center },
            currentRoom: suggestion.room,
          };
        }
        return d;
      });

      // Find disprover clockwise
      const disproverInfo = findDisproverClockwise(suggestion, activeId, detectiveOrder, hands, detectives);

      // Anchor suggestion to 0G Chain
      const suggestChainRes = await fetch("/api/chain/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SUGGESTION",
          data: { gameId, round, turn, detective: activeId, suggestion },
        }),
      });
      const suggestChainData = await suggestChainRes.json();
      if (!suggestChainRes.ok || !suggestChainData.ok) {
        throw new Error(suggestChainData.error || `Failed to record suggestion on 0G Chain: HTTP ${suggestChainRes.status}`);
      }

      // Upload suggestion metadata to 0G Storage
      const suggestStorageRes = await fetch("/api/storage/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: `suggest-${gameId}-${round}-${turn}`,
          data: { suggestion },
        }),
      });
      const suggestStorageData = await suggestStorageRes.json();
      if (!suggestStorageRes.ok || !suggestStorageData.ok) {
        throw new Error(suggestStorageData.error || `Failed to upload suggestion to 0G Storage: HTTP ${suggestStorageRes.status}`);
      }

      get().addLog(
        activeId,
        "SUGGEST",
        `Suggests: ${suggestion.suspect} | ${suggestion.weapon} | ${suggestion.room}`,
        suggestChainData.txHash,
        suggestStorageData.rootHash,
        suggestStorageData.txSeq
      );

      get().addLog(
        finalSuspect,
        "ENTER_ROOM",
        `Was summoned to the ${suggestion.room.replace(/_/g, " ")} for questioning.`
      );

      if (disproverInfo) {
        const disproverId = disproverInfo.disproverId;

        if (disproverId === humanDetectiveId) {
          // Pause execution and prompt the human player to select which card to reveal!
          set({
            detectives: updatedDetectives,
            pendingSuggestion: suggestion,
            disprovalPending: {
              suggesterId: activeId,
              suggestion,
              disproverId: humanDetectiveId,
              candidates: disproverInfo.matchingCards,
            },
            isSyncing: false,
            syncMessage: null,
          });

          get().addLog(
            humanDetectiveId,
            "SYSTEM",
            `Awaiting your disproval card choice to show ${activeId}.`
          );
          return;
        }

        // It is an AI disprover: auto-reveal the first matching card
        const card = disproverInfo.matchingCards[0];
        const { encryptPayload, buildCluePayload } = await import("@/lib/crypto/hybrid");
        const recipientDet = detectives.find((d) => d.id === activeId)!;

        const cluePayload = buildCluePayload({
          gameId,
          round,
          revealingAgentId: disproverId,
          receivingAgentId: activeId,
          cardType: card.type,
          cardId: card.id,
          cardName: card.name,
        });

        const encryptedBundle = await encryptPayload(cluePayload, recipientDet.publicKey);

        const revealStorageRes = await fetch("/api/storage/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: `reveal-${gameId}-${round}-${turn}`,
            data: { encryptedBundle },
          }),
        });
        const revealStorageData = await revealStorageRes.json();
        if (!revealStorageRes.ok || !revealStorageData.ok) {
          throw new Error(revealStorageData.error || `Failed to upload encrypted reveal to 0G Storage: HTTP ${revealStorageRes.status}`);
        }

        const revealChainRes = await fetch("/api/chain/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "REVEAL",
            data: { gameId, round, turn, disprover: disproverId, recipient: activeId, success: true },
          }),
        });
        const revealChainData = await revealChainRes.json();
        if (!revealChainRes.ok || !revealChainData.ok) {
          throw new Error(revealChainData.error || `Failed to record reveal on 0G Chain: HTTP ${revealChainRes.status}`);
        }

        let updatedNotebooks = { ...notebooks };
        let updatedConfidence = { ...confidence };
        updatedNotebooks[activeId] = updateNotebookFromReveal(notebooks[activeId], card);
        updatedConfidence[activeId] = calculateConfidence(updatedNotebooks[activeId]);

        const customDetective = get().customDetective;
        const customAccusationLimit = customDetective && customDetective.targetAgentId === activeId ? customDetective.accusationRiskLimit : undefined;
        const solution = activeId === humanDetectiveId
          ? runDeductionAnalysis(updatedNotebooks[activeId])
          : checkAIAccusationDecision(activeId, updatedNotebooks[activeId], round, customAccusationLimit);

        set({
          notebooks: updatedNotebooks,
          confidence: updatedConfidence,
          pendingSuggestion: suggestion,
          detectives: updatedDetectives,
          actionState: solution ? "accusing" : "next_turn_pending",
          isSyncing: false,
          syncMessage: null,
        });

        get().addLog(
          disproverId,
          "DISPROVE",
          `Showed a card to ${activeId}. (Encrypted 0G Storage Clue Reveal)`,
          revealChainData.txHash,
          revealStorageData.rootHash,
          revealStorageData.txSeq
        );
      } else {
        // No one could disprove
        const revealStorageRes = await fetch("/api/storage/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: `reveal-none-${gameId}-${round}-${turn}`,
            data: { success: false, reason: "NO_DISPROVAL" },
          }),
        });
        const revealStorageData = await revealStorageRes.json();
        if (!revealStorageRes.ok || !revealStorageData.ok) {
          throw new Error(revealStorageData.error || `Failed to upload reveal-none to 0G Storage: HTTP ${revealStorageRes.status}`);
        }

        const revealChainRes = await fetch("/api/chain/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "REVEAL_NONE",
            data: { gameId, round, turn, success: false },
          }),
        });
        const revealChainData = await revealChainRes.json();
        if (!revealChainRes.ok || !revealChainData.ok) {
          throw new Error(revealChainData.error || `Failed to record reveal-none on 0G Chain: HTTP ${revealChainRes.status}`);
        }

        let updatedNotebooks = { ...notebooks };
        let updatedConfidence = { ...confidence };
        updatedNotebooks[activeId] = updateNotebookFromNoDisproval(notebooks[activeId], suggestion);
        updatedConfidence[activeId] = calculateConfidence(updatedNotebooks[activeId]);

        const customDetective = get().customDetective;
        const customAccusationLimit = customDetective && customDetective.targetAgentId === activeId ? customDetective.accusationRiskLimit : undefined;
        const solution = activeId === humanDetectiveId
          ? runDeductionAnalysis(updatedNotebooks[activeId])
          : checkAIAccusationDecision(activeId, updatedNotebooks[activeId], round, customAccusationLimit);

        set({
          notebooks: updatedNotebooks,
          confidence: updatedConfidence,
          pendingSuggestion: suggestion,
          detectives: updatedDetectives,
          actionState: solution ? "accusing" : "next_turn_pending",
          isSyncing: false,
          syncMessage: null,
        });

        get().addLog(
          activeId,
          "NO_DISPROVAL",
          `Nobody could disprove the suggestion!`,
          revealChainData.txHash,
          revealStorageData.rootHash,
          revealStorageData.txSeq
        );
      }
    } catch (err: any) {
      console.error("[0G Suggest] Suggestion sync failed:", err);
      set({
        isSyncing: false,
        syncMessage: null,
        error: err?.message || String(err),
      });
    }
  },

  // ── Human Action: Make suggestion ────────────────────────
  makeHumanSuggestion: async (suggestion: Suggestion) => {
    const { currentDetectiveIndex, detectiveOrder, detectives, hands, notebooks, confidence, gameId, round, turn, humanDetectiveId } = get();
    const activeId = detectiveOrder[currentDetectiveIndex];
    if (activeId !== humanDetectiveId || activeId === null) return;

    set({
      isSyncing: true,
      syncMessage: "Submitting human suggestion to 0G Network...",
      error: null,
    });

    try {
      const roomConfig = ROOM_BY_ID[suggestion.room];
      const updatedDetectives = detectives.map((d) => {
        if (d.id === suggestion.suspect) {
          return {
            ...d,
            position: { ...roomConfig.center },
            currentRoom: suggestion.room,
          };
        }
        return d;
      });

      // Find disprover clockwise
      const disproverInfo = findDisproverClockwise(suggestion, activeId, detectiveOrder, hands, detectives);

      // Anchor suggestion to 0G Chain
      const suggestChainRes = await fetch("/api/chain/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SUGGESTION",
          data: { gameId, round, turn, detective: activeId, suggestion },
        }),
      });
      const suggestChainData = await suggestChainRes.json();
      if (!suggestChainRes.ok || !suggestChainData.ok) {
        throw new Error(suggestChainData.error || `Failed to record suggestion on 0G Chain: HTTP ${suggestChainRes.status}`);
      }

      // Upload suggestion metadata to 0G Storage
      const suggestStorageRes = await fetch("/api/storage/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: `suggest-${gameId}-${round}-${turn}`,
          data: { suggestion },
        }),
      });
      const suggestStorageData = await suggestStorageRes.json();
      if (!suggestStorageRes.ok || !suggestStorageData.ok) {
        throw new Error(suggestStorageData.error || `Failed to upload suggestion to 0G Storage: HTTP ${suggestStorageRes.status}`);
      }

      get().addLog(
        activeId,
        "SUGGEST",
        `Suggests: ${suggestion.suspect} | ${suggestion.weapon} | ${suggestion.room}`,
        suggestChainData.txHash,
        suggestStorageData.rootHash,
        suggestStorageData.txSeq
      );

      get().addLog(
        suggestion.suspect,
        "ENTER_ROOM",
        `Was summoned to the ${suggestion.room.replace(/_/g, " ")} for questioning.`
      );

      let updatedNotebooks = { ...notebooks };
      let updatedConfidence = { ...confidence };

      if (disproverInfo) {
        // Since suggester is Human, disprover is always an AI
        const disproverId = disproverInfo.disproverId;
        const card = disproverInfo.matchingCards[0]; // AI automatically shows first matching card

        const { encryptPayload, buildCluePayload } = await import("@/lib/crypto/hybrid");
        const recipientDet = detectives.find((d) => d.id === activeId)!;

        const cluePayload = buildCluePayload({
          gameId,
          round,
          revealingAgentId: disproverId,
          receivingAgentId: activeId,
          cardType: card.type,
          cardId: card.id,
          cardName: card.name,
        });

        // Encrypt with human's public key
        const encryptedBundle = await encryptPayload(cluePayload, recipientDet.publicKey);

        const revealStorageRes = await fetch("/api/storage/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: `reveal-${gameId}-${round}-${turn}`,
            data: { encryptedBundle },
          }),
        });
        const revealStorageData = await revealStorageRes.json();
        if (!revealStorageRes.ok || !revealStorageData.ok) {
          throw new Error(revealStorageData.error || `Failed to upload encrypted reveal to 0G Storage: HTTP ${revealStorageRes.status}`);
        }

        const revealChainRes = await fetch("/api/chain/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "REVEAL",
            data: { gameId, round, turn, disprover: disproverId, recipient: activeId, success: true },
          }),
        });
        const revealChainData = await revealChainRes.json();
        if (!revealChainRes.ok || !revealChainData.ok) {
          throw new Error(revealChainData.error || `Failed to record reveal on 0G Chain: HTTP ${revealChainRes.status}`);
        }

        // Human decrypts directly using their private key in memory to display the card name
        updatedNotebooks[activeId] = updateNotebookFromReveal(notebooks[activeId], card);
        updatedConfidence[activeId] = calculateConfidence(updatedNotebooks[activeId]);

        const solution = runDeductionAnalysis(updatedNotebooks[activeId]);

        set({
          notebooks: updatedNotebooks,
          confidence: updatedConfidence,
          pendingSuggestion: suggestion,
          detectives: updatedDetectives,
          actionState: solution ? "accusing" : "next_turn_pending",
          isSyncing: false,
          syncMessage: null,
        });

        get().addLog(
          disproverId,
          "DISPROVE",
          `Showed you the card: ${card.name}. (Decrypted from 0G Storage Clue Reveal)`,
          revealChainData.txHash,
          revealStorageData.rootHash,
          revealStorageData.txSeq
        );
      } else {
        // No one could disprove
        const revealStorageRes = await fetch("/api/storage/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: `reveal-none-${gameId}-${round}-${turn}`,
            data: { success: false, reason: "NO_DISPROVAL" },
          }),
        });
        const revealStorageData = await revealStorageRes.json();
        if (!revealStorageRes.ok || !revealStorageData.ok) {
          throw new Error(revealStorageData.error || `Failed to upload reveal-none to 0G Storage: HTTP ${revealStorageRes.status}`);
        }

        const revealChainRes = await fetch("/api/chain/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "REVEAL_NONE",
            data: { gameId, round, turn, success: false },
          }),
        });
        const revealChainData = await revealChainRes.json();
        if (!revealChainRes.ok || !revealChainData.ok) {
          throw new Error(revealChainData.error || `Failed to record reveal-none on 0G Chain: HTTP ${revealChainRes.status}`);
        }

        updatedNotebooks[activeId] = updateNotebookFromNoDisproval(notebooks[activeId], suggestion);
        updatedConfidence[activeId] = calculateConfidence(updatedNotebooks[activeId]);

        const solution = runDeductionAnalysis(updatedNotebooks[activeId]);

        set({
          notebooks: updatedNotebooks,
          confidence: updatedConfidence,
          pendingSuggestion: suggestion,
          detectives: updatedDetectives,
          actionState: solution ? "accusing" : "next_turn_pending",
          isSyncing: false,
          syncMessage: null,
        });

        get().addLog(
          activeId,
          "NO_DISPROVAL",
          `Nobody could disprove your suggestion! Notebook updated.`,
          revealChainData.txHash,
          revealStorageData.rootHash,
          revealStorageData.txSeq
        );
      }
    } catch (err: any) {
      console.error("[Human Suggest] Suggestion failed:", err);
      set({
        isSyncing: false,
        syncMessage: null,
        error: err?.message || String(err),
      });
    }
  },

  // ── Human Action: Resolve Pending Disproval ────────────────
  resolveHumanDisproval: async (selectedCard: Card) => {
    const { disprovalPending, gameId, round, turn, notebooks, confidence, detectives } = get();
    if (!disprovalPending) return;

    set({
      isSyncing: true,
      syncMessage: "Encrypting and submitting disproval clue to 0G Storage...",
      error: null,
    });

    try {
      const { suggesterId, suggestion, disproverId } = disprovalPending;

      const { encryptPayload, buildCluePayload } = await import("@/lib/crypto/hybrid");
      const recipientDet = detectives.find((d) => d.id === suggesterId)!;

      const cluePayload = buildCluePayload({
        gameId,
        round,
        revealingAgentId: disproverId,
        receivingAgentId: suggesterId,
        cardType: selectedCard.type,
        cardId: selectedCard.id,
        cardName: selectedCard.name,
      });

      const encryptedBundle = await encryptPayload(cluePayload, recipientDet.publicKey);

      const revealStorageRes = await fetch("/api/storage/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: `reveal-${gameId}-${round}-${turn}`,
          data: { encryptedBundle },
        }),
      });
      const revealStorageData = await revealStorageRes.json();
      if (!revealStorageRes.ok || !revealStorageData.ok) {
        throw new Error(revealStorageData.error || `Failed to upload encrypted reveal to 0G Storage: HTTP ${revealStorageRes.status}`);
      }

      const revealChainRes = await fetch("/api/chain/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REVEAL",
          data: { gameId, round, turn, disprover: disproverId, recipient: suggesterId, success: true },
        }),
      });
      const revealChainData = await revealChainRes.json();
      if (!revealChainRes.ok || !revealChainData.ok) {
        throw new Error(revealChainData.error || `Failed to record reveal on 0G Chain: HTTP ${revealChainRes.status}`);
      }

      let updatedNotebooks = { ...notebooks };
      let updatedConfidence = { ...confidence };

      // Update AI's notebook since they received the card
      updatedNotebooks[suggesterId] = updateNotebookFromReveal(notebooks[suggesterId], selectedCard);
      updatedConfidence[suggesterId] = calculateConfidence(updatedNotebooks[suggesterId]);

      const customDetective = get().customDetective;
      const customAccusationLimit = customDetective && customDetective.targetAgentId === suggesterId ? customDetective.accusationRiskLimit : undefined;
      const solution = checkAIAccusationDecision(suggesterId, updatedNotebooks[suggesterId], round, customAccusationLimit);

      set({
        notebooks: updatedNotebooks,
        confidence: updatedConfidence,
        disprovalPending: null,
        actionState: solution ? "accusing" : "next_turn_pending",
        isSyncing: false,
        syncMessage: null,
      });

      get().addLog(
        disproverId,
        "DISPROVE",
        `You showed a card (${selectedCard.name}) to ${suggesterId}. (Encrypted Clue)`,
        revealChainData.txHash,
        revealStorageData.rootHash,
        revealStorageData.txSeq
      );
    } catch (err: any) {
      console.error("[Human Disproval] Failed to resolve disproval:", err);
      set({
        isSyncing: false,
        syncMessage: null,
        error: err?.message || String(err),
      });
    }
  },

  // ── Accusation ───────────────────────────────────────────
  makeAccusation: async (accusation: Suggestion) => {
    const { envelope, currentDetectiveIndex, detectiveOrder, detectives, gameId, round, turn } = get();
    const activeId = detectiveOrder[currentDetectiveIndex];

    if (!envelope) return;

    set({
      isSyncing: true,
      syncMessage: "Submitting accusation to 0G Galileo blockchain...",
      error: null,
    });

    try {
      const correct = checkAccusation(accusation, envelope);

      // Anchor accusation to 0G Chain
      const chainRes = await fetch("/api/chain/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ACCUSATION",
          data: { gameId, round, turn, detective: activeId, accusation, correct },
        }),
      });
      const chainData = await chainRes.json();
      if (!chainRes.ok || !chainData.ok) {
        throw new Error(chainData.error || `Failed to record accusation on 0G Chain: HTTP ${chainRes.status}`);
      }

      set({
        isSyncing: false,
        syncMessage: null,
      });

      get().addLog(
        activeId,
        "ACCUSE",
        `Final accusation: ${accusation.suspect} | ${accusation.weapon} | ${accusation.room}`,
        chainData.txHash
      );

      if (correct) {
        get().addLog("SYSTEM", "GAME_OVER", `${activeId} solved the mystery! Case closed.`);
        set({ status: "finished", winner: activeId, actionState: "idle" });
      } else {
        get().addLog(
          activeId,
          "ELIMINATED",
          `Wrong accusation. ${activeId} is eliminated from the game.`
        );
        const updatedDetectives = detectives.map((d) =>
          d.id === activeId ? { ...d, eliminated: true } : d
        );
        const remaining = updatedDetectives.filter((d) => !d.eliminated);
        if (remaining.length === 0) {
          get().addLog("SYSTEM", "GAME_OVER", `All detectives eliminated. The mystery remains unsolved.`);
          set({ status: "finished", detectives: updatedDetectives, actionState: "idle" });
        } else {
          set({ detectives: updatedDetectives, actionState: "next_turn_pending" });
        }
      }
    } catch (err: any) {
      console.error("[0G Accusation] Accusation sync failed:", err);
      set({
        isSyncing: false,
        syncMessage: null,
        error: err?.message || String(err),
      });
    }
  },

  // ── Advance turn ─────────────────────────────────────────
  advanceTurn: () => {
    const { detectiveOrder, currentDetectiveIndex, detectives, turn, round } = get();

    // Find next non-eliminated detective
    let nextIndex = (currentDetectiveIndex + 1) % detectiveOrder.length;
    let loopCount = 0;

    while (
      detectives.find((d) => d.id === detectiveOrder[nextIndex])?.eliminated &&
      loopCount < detectiveOrder.length
    ) {
      nextIndex = (nextIndex + 1) % detectiveOrder.length;
      loopCount++;
    }

    const newTurn = turn + 1;
    const newRound = nextIndex === 0 ? round + 1 : round;

    set({
      currentDetectiveIndex: nextIndex,
      turn: newTurn,
      round: newRound,
      actionState: "idle",
      diceRoll: null,
      movementPath: [],
      movementStep: 0,
      pendingSuggestion: null,
    });

    get().addLog(
      detectiveOrder[nextIndex],
      "TURN_START",
      `Round ${newRound}, Turn ${newTurn} — ${detectiveOrder[nextIndex]}'s move.`
    );
  },

  // ── Log helper ───────────────────────────────────────────
  addLog: (agentId, action, details, txHash, rootHash, txSeq) => {
    const entry: LogEntry = {
      id: makeId(),
      timestamp: Date.now(),
      agentId,
      action,
      details,
      isEncrypted: false,
      txHash,
      rootHash,
      txSeq,
    };
    set((s) => ({ log: [...s.log, entry] }));
  },

  // ── AI Thought Monologues (0G Compute) ───────────────────
  fetchAIMonologue: async (agentId, context, action) => {
    const { customDetective } = get();
    const isCustom = customDetective !== null && customDetective.targetAgentId === agentId;
    set({ isThinking: true, activeMonologue: null });
    try {
      const res = await fetch("/api/inference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          context,
          action,
          customSystemPrompt: isCustom ? customDetective.personalityPrompt : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Monologue API failed: HTTP ${res.status}`);
      }
      if (data.answer) {
        set({ activeMonologue: data.answer, isThinking: false });
        get().addLog(agentId, "THINK", data.answer);
      } else {
        set({ isThinking: false });
      }
    } catch (err: any) {
      console.warn("[0G Compute] Monologue fetch failed (non-fatal):", err?.message || String(err));
      set({ isThinking: false, activeMonologue: null });
    }
  },
}));
