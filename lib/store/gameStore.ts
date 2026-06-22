import { create } from "zustand";
import type {
  DetectiveId,
  DetectiveState,
  Card,
  Envelope,
  DeductionNotebook,
  GameActionState,
  GameStatus,
  LogEntry,
  Suggestion,
  Position,
} from "@/lib/game/types";
import {
  DETECTIVES,
  STARTING_POSITIONS,
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
} from "@/lib/game/deduction";
import { findPath, getReachableDoors, walkPath, getRoomAt } from "@/lib/game/board";

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
}

export interface GameActions {
  initGame: () => void;
  rollDiceAction: () => void;
  stepMovement: () => void;
  makeSuggestion: (suggestion: Suggestion) => void;
  makeAccusation: (accusation: Suggestion) => void;
  advanceTurn: () => void;
  addLog: (agentId: DetectiveId | "SYSTEM", action: string, details: string) => void;
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
};

// ============================================================
// STORE
// ============================================================

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  ...INITIAL_STATE,

  // ── Init ─────────────────────────────────────────────────
  initGame: () => {
    const gameId = makeId();
    const detectiveIds = ALL_DETECTIVE_IDS;
    const { envelope, hands } = setupDeck(detectiveIds);

    const detectives: DetectiveState[] = DETECTIVES.map((d) => ({
      id: d.id,
      name: d.name,
      color: d.color,
      position: { ...STARTING_POSITIONS[d.id] },
      currentRoom: null,
      cards: hands[d.id],
      publicKey: "",          // populated in Phase 3 (crypto init)
      eliminated: false,
    }));

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
      details: `Ashford Manor Mystery begins. Game ID: ${gameId}. 5 detectives enter the manor.`,
      isEncrypted: false,
    };

    set({
      ...INITIAL_STATE,
      status: "playing",
      gameId,
      round: 1,
      turn: 1,
      currentDetectiveIndex: 0,
      actionState: "idle",
      detectives,
      detectiveOrder: detectiveIds,
      envelope,
      hands,
      notebooks,
      confidence,
      log: [initLog],
    });

    // Background upload of game setup to 0G Storage
    fetch("/api/storage/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: `setup-${gameId}`,
        data: { envelope, hands },
      }),
    })
      .then((res) => res.json())
      .then((resData) => {
        if (resData.ok && resData.rootHash) {
          get().addLog(
            "SYSTEM",
            "STORAGE_UPLOAD",
            `Dealt hands and secret envelope encrypted and stored in 0G Storage. Root hash: ${resData.rootHash}`
          );
        }
      })
      .catch((err) => console.error("Initial storage upload failed", err));
  },

  // ── Dice ─────────────────────────────────────────────────
  rollDiceAction: () => {
    const { actionState, currentDetectiveIndex, detectives, detectiveOrder } = get();
    if (actionState !== "idle") return;

    const roll = rollDice();
    const activeId = detectiveOrder[currentDetectiveIndex];
    const detective = detectives.find((d) => d.id === activeId)!;

    // Compute reachable doors for target selection by AI
    const reachableDoors = getReachableDoors(detective.position, roll);

    // For now: auto-pick closest reachable door, or just move forward
    let targetDoor = reachableDoors.sort((a, b) => a.distance - b.distance)[0];
    let path: Position[] | null = null;

    if (targetDoor) {
      path = findPath(detective.position, targetDoor.door);
    }

    if (!path || path.length === 0) {
      // No reachable room — just walk in a straight line (N if possible)
      const fallback: Position = { x: detective.position.x, y: Math.max(0, detective.position.y - roll) };
      path = findPath(detective.position, fallback) ?? [detective.position];
    }

    const clampedPath = path.slice(0, roll + 1); // include start + roll steps

    set({
      diceRoll: roll,
      actionState: "moving",
      movementPath: clampedPath,
      movementStep: 0,
    });

    get().addLog(activeId, "ROLL", `Rolled a ${roll}. Moving ${clampedPath.length - 1} step(s).`);

    const { gameId, round, turn } = get();
    // Anchor dice roll to 0G Chain
    fetch("/api/chain/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "DICE_ROLL",
        data: { gameId, round, turn, detective: activeId, roll },
      }),
    })
      .then((res) => res.json())
      .then((resData) => {
        if (resData.ok && resData.txHash) {
          get().addLog(
            "SYSTEM",
            "CHAIN_CONFIRM",
            `Dice roll by ${activeId} anchored on 0G Chain. Tx: ${resData.txHash.substring(0, 18)}...`
          );
        }
      })
      .catch((err) => console.error("Chain record failed for dice roll", err));
  },

  // ── Step movement (called per animation frame / tick) ────
  stepMovement: () => {
    const { movementPath, movementStep, currentDetectiveIndex, detectiveOrder, detectives, actionState } = get();
    if (actionState !== "moving") return;

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

  // ── Suggestion ───────────────────────────────────────────
  makeSuggestion: (suggestion: Suggestion) => {
    const { currentDetectiveIndex, detectiveOrder, hands, notebooks, confidence } = get();
    const activeId = detectiveOrder[currentDetectiveIndex];

    get().addLog(
      activeId,
      "SUGGEST",
      `Suggests: ${suggestion.suspect} | ${suggestion.weapon} | ${suggestion.room}`
    );

    const result = processSuggestion(suggestion, activeId, detectiveOrder, hands);

    let updatedNotebooks = { ...notebooks };
    let updatedConfidence = { ...confidence };

    if (result) {
      // Someone disproved — update active detective's notebook
      updatedNotebooks[activeId] = updateNotebookFromReveal(notebooks[activeId], result.card);
      updatedConfidence[activeId] = calculateConfidence(updatedNotebooks[activeId]);

      get().addLog(
        result.disproverId,
        "DISPROVE",
        `Showed a card to ${activeId}. (Private reveal)`
      );
    } else {
      // Nobody disproved — strong hint toward envelope
      updatedNotebooks[activeId] = updateNotebookFromNoDisproval(notebooks[activeId], suggestion);
      updatedConfidence[activeId] = calculateConfidence(updatedNotebooks[activeId]);
      get().addLog(activeId, "NO_DISPROVAL", `Nobody could disprove the suggestion!`);
    }

    // Check if the detective has now solved the case
    const solution = runDeductionAnalysis(updatedNotebooks[activeId]);

    set({
      notebooks: updatedNotebooks,
      confidence: updatedConfidence,
      pendingSuggestion: suggestion,
      actionState: solution ? "accusing" : "next_turn_pending",
    });

    const { gameId, round, turn } = get();
    // Anchor suggestion to 0G Chain
    fetch("/api/chain/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "SUGGESTION",
        data: { gameId, round, turn, detective: activeId, suggestion },
      }),
    })
      .then((res) => res.json())
      .then((resData) => {
        if (resData.ok && resData.txHash) {
          get().addLog(
            "SYSTEM",
            "CHAIN_CONFIRM",
            `Suggestion anchored on 0G Chain. Tx: ${resData.txHash.substring(0, 18)}...`
          );
        }
      })
      .catch((err) => console.error("Chain record failed for suggestion", err));

    // Upload encrypted suggestion and result to 0G Storage
    fetch("/api/storage/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: `suggest-${gameId}-${turn}`,
        data: { suggestion, result: result ? { disprover: result.disproverId } : "NO_DISPROVAL" },
      }),
    })
      .then((res) => res.json())
      .then((resData) => {
        if (resData.ok && resData.rootHash) {
          get().addLog(
            "SYSTEM",
            "STORAGE_UPLOAD",
            `Suggestion notebook data encrypted and stored in 0G Storage. Root: ${resData.rootHash.substring(0, 16)}...`
          );
        }
      })
      .catch((err) => console.error("Storage upload failed for suggestion", err));
  },

  // ── Accusation ───────────────────────────────────────────
  makeAccusation: (accusation: Suggestion) => {
    const { envelope, currentDetectiveIndex, detectiveOrder, detectives } = get();
    const activeId = detectiveOrder[currentDetectiveIndex];

    get().addLog(
      activeId,
      "ACCUSE",
      `Final accusation: ${accusation.suspect} | ${accusation.weapon} | ${accusation.room}`
    );

    if (!envelope) return;

    const correct = checkAccusation(accusation, envelope);

    if (correct) {
      get().addLog("SYSTEM", "GAME_OVER", `${activeId} solved the mystery! Case closed.`);
      set({ status: "finished", winner: activeId, actionState: "idle" });
    } else {
      // Eliminate the detective
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

    const { gameId, round, turn } = get();
    // Anchor accusation to 0G Chain
    fetch("/api/chain/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ACCUSATION",
        data: { gameId, round, turn, detective: activeId, accusation, correct },
      }),
    })
      .then((res) => res.json())
      .then((resData) => {
        if (resData.ok && resData.txHash) {
          get().addLog(
            "SYSTEM",
            "CHAIN_CONFIRM",
            `Accusation anchored on 0G Chain. Tx: ${resData.txHash.substring(0, 18)}...`
          );
        }
      })
      .catch((err) => console.error("Chain record failed for accusation", err));
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
  addLog: (agentId, action, details) => {
    const entry: LogEntry = {
      id: makeId(),
      timestamp: Date.now(),
      agentId,
      action,
      details,
      isEncrypted: false,
    };
    set((s) => ({ log: [...s.log, entry] }));
  },

  // ── AI Thought Monologues (0G Compute) ───────────────────
  fetchAIMonologue: async (agentId, context, action) => {
    set({ isThinking: true, activeMonologue: null });
    try {
      const res = await fetch("/api/inference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, context, action }),
      });
      const data = await res.json();
      if (data.ok && data.answer) {
        set({ activeMonologue: data.answer, isThinking: false });
        get().addLog(
          agentId,
          "THINK",
          data.answer
        );
      } else {
        set({ isThinking: false });
      }
    } catch (err) {
      console.warn("[0G Compute] API call failed, thinking skipped:", err);
      set({ isThinking: false });
    }
  },
}));
