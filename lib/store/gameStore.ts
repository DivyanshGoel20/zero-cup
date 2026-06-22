import { create } from "zustand";
import type {
  DetectiveId,
  WeaponId,
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
}

export interface GameActions {
  initGame: () => Promise<void>;
  rollDiceAction: () => Promise<void>;
  stepMovement: () => void;
  makeSuggestion: () => Promise<void>;
  makeAccusation: (accusation: Suggestion) => Promise<void>;
  advanceTurn: () => void;
  addLog: (
    agentId: DetectiveId | "SYSTEM",
    action: string,
    details: string,
    txHash?: string,
    rootHash?: string
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
};

// ============================================================
// STORE
// ============================================================

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  ...INITIAL_STATE,

  // ── Init ─────────────────────────────────────────────────
  initGame: async () => {
    const gameId = makeId();
    const detectiveIds = ALL_DETECTIVE_IDS;
    const { envelope, hands } = setupDeck(detectiveIds);

    set({
      isSyncing: true,
      syncMessage: "Generating RSA key pairs for AI detectives...",
      error: null,
    });

    try {
      const { generateKeyPair } = await import("@/lib/crypto/hybrid");
      const detectives: DetectiveState[] = await Promise.all(
        DETECTIVES.map(async (d) => {
          const keys = await generateKeyPair();
          return {
            id: d.id,
            name: d.name,
            color: d.color,
            position: { ...STARTING_POSITIONS[d.id] },
            currentRoom: null,
            cards: hands[d.id],
            publicKey: keys.publicKey,
            eliminated: false,
          };
        })
      );

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

      // Upload game setup to 0G Storage
      const res = await fetch("/api/storage/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: `setup-${gameId}`,
          data: { envelope, hands },
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
        details: `Dealt hands and secret envelope encrypted and stored in 0G Storage.`,
        isEncrypted: false,
        rootHash: resData.rootHash,
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
        log: [initLog, uploadLog],
        isSyncing: false,
        syncMessage: null,
        error: null,
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
    const { actionState, currentDetectiveIndex, detectives, detectiveOrder, gameId, round, turn } = get();
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

      // Compute reachable doors for target selection by AI
      const reachableDoors = getReachableDoors(detective.position, roll);

      // auto-pick closest reachable door, or just move forward
      let targetDoor = reachableDoors.sort((a, b) => a.distance - b.distance)[0];
      let path: Position[] | null = null;

      if (targetDoor) {
        path = findPath(detective.position, targetDoor.door);
      }

      if (!path || path.length === 0) {
        const fallback: Position = { x: detective.position.x, y: Math.max(0, detective.position.y - roll) };
        path = findPath(detective.position, fallback) ?? [detective.position];
      }

      const clampedPath = path.slice(0, roll + 1);

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

      // 2. Upload movement path metadata to 0G Storage
      const storageRes = await fetch("/api/storage/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: `move-${gameId}-${round}-${turn}`,
          data: { detective: activeId, roll, path: clampedPath },
        }),
      });
      const storageData = await storageRes.json();
      if (!storageRes.ok || !storageData.ok) {
        throw new Error(storageData.error || `Failed to upload movement to 0G Storage: HTTP ${storageRes.status}`);
      }

      set({
        diceRoll: roll,
        actionState: "moving",
        movementPath: clampedPath,
        movementStep: 0,
        isSyncing: false,
        syncMessage: null,
      });

      get().addLog(
        activeId,
        "ROLL",
        `Rolled a ${roll}. Moving ${clampedPath.length - 1} step(s).`,
        chainData.txHash,
        storageData.rootHash
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
  makeSuggestion: async () => {
    const { currentDetectiveIndex, detectiveOrder, detectives, hands, notebooks, confidence, gameId, round, turn } = get();
    const activeId = detectiveOrder[currentDetectiveIndex];
    const detective = detectives.find((d) => d.id === activeId)!;
    const notebook = notebooks[activeId];

    if (!detective.currentRoom || !notebook) {
      throw new Error("Cannot suggest: detective is not inside a room or notebook is missing.");
    }

    set({
      isSyncing: true,
      syncMessage: `Consulting Qwen model for ${detective.name}'s suggestion decision...`,
      error: null,
    });

    try {
      const possibleSuspects = (Object.keys(notebook.suspects) as DetectiveId[]).filter(
        (id) => notebook.suspects[id] === "POSSIBLE"
      );
      const possibleWeapons = (Object.keys(notebook.weapons) as WeaponId[]).filter(
        (id) => notebook.weapons[id] === "POSSIBLE"
      );

      // Query Qwen model to choose a suspect and weapon
      const inferenceRes = await fetch("/api/inference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: activeId,
          context: `Possible Suspects: [${possibleSuspects.join(", ")}]\nPossible Weapons: [${possibleWeapons.join(", ")}]\nCurrent Room: ${detective.currentRoom}`,
          action: "DECIDE_SUGGESTION",
        }),
      });

      const inferenceData = await inferenceRes.json();
      if (!inferenceRes.ok || !inferenceData.ok || !inferenceData.decision) {
        throw new Error(inferenceData.error || `Qwen decision API failed: HTTP ${inferenceRes.status}`);
      }

      const { suspect, weapon } = inferenceData.decision;
      const finalSuspect = possibleSuspects.includes(suspect) ? suspect : (possibleSuspects[0] || "VANCE");
      const finalWeapon = possibleWeapons.includes(weapon) ? weapon : (possibleWeapons[0] || "PEARL_PISTOL");

      const suggestion: Suggestion = {
        suspect: finalSuspect,
        weapon: finalWeapon,
        room: detective.currentRoom,
      };

      set({ syncMessage: "Anchoring suggestion and disproval to 0G Storage & Chain..." });

      const result = processSuggestion(suggestion, activeId, detectiveOrder, hands);

      let updatedNotebooks = { ...notebooks };
      let updatedConfidence = { ...confidence };

      if (result) {
        updatedNotebooks[activeId] = updateNotebookFromReveal(notebooks[activeId], result.card);
        updatedConfidence[activeId] = calculateConfidence(updatedNotebooks[activeId]);
      } else {
        updatedNotebooks[activeId] = updateNotebookFromNoDisproval(notebooks[activeId], suggestion);
        updatedConfidence[activeId] = calculateConfidence(updatedNotebooks[activeId]);
      }

      const solution = runDeductionAnalysis(updatedNotebooks[activeId]);

      // 1. Anchor suggestion to 0G Chain
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

      // 2. Upload suggestion metadata to 0G Storage
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

      // 3. Anchor & upload disproval reveal
      let revealRootHash = "";
      let revealTxHash = "";

      if (result) {
        const { encryptPayload, buildCluePayload } = await import("@/lib/crypto/hybrid");
        const recipientDet = detectives.find((d) => d.id === activeId)!;
        
        const cluePayload = buildCluePayload({
          gameId,
          round,
          revealingAgentId: result.disproverId,
          receivingAgentId: activeId,
          cardType: result.card.type,
          cardId: result.card.id,
          cardName: result.card.name,
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
        revealRootHash = revealStorageData.rootHash;

        const revealChainRes = await fetch("/api/chain/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "REVEAL",
            data: { gameId, round, turn, disprover: result.disproverId, recipient: activeId, success: true },
          }),
        });
        const revealChainData = await revealChainRes.json();
        if (!revealChainRes.ok || !revealChainData.ok) {
          throw new Error(revealChainData.error || `Failed to record reveal on 0G Chain: HTTP ${revealChainRes.status}`);
        }
        revealTxHash = revealChainData.txHash;
      } else {
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
        revealRootHash = revealStorageData.rootHash;

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
        revealTxHash = revealChainData.txHash;
      }

      set({
        notebooks: updatedNotebooks,
        confidence: updatedConfidence,
        pendingSuggestion: suggestion,
        actionState: solution ? "accusing" : "next_turn_pending",
        isSyncing: false,
        syncMessage: null,
      });

      get().addLog(
        activeId,
        "SUGGEST",
        `Suggests: ${suggestion.suspect} | ${suggestion.weapon} | ${suggestion.room}`,
        suggestChainData.txHash,
        suggestStorageData.rootHash
      );

      if (result) {
        get().addLog(
          result.disproverId,
          "DISPROVE",
          `Showed a card to ${activeId}. (Encrypted 0G Storage Clue Reveal)`,
          revealTxHash,
          revealRootHash
        );
      } else {
        get().addLog(
          activeId,
          "NO_DISPROVAL",
          `Nobody could disprove the suggestion!`,
          revealTxHash,
          revealRootHash
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

    if (newRound > 2) {
      get().addLog("SYSTEM", "GAME_OVER", `Match ended after 2 rounds to conserve API limits.`);
      set({ status: "finished", actionState: "idle" });
      return;
    }

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
  addLog: (agentId, action, details, txHash, rootHash) => {
    const entry: LogEntry = {
      id: makeId(),
      timestamp: Date.now(),
      agentId,
      action,
      details,
      isEncrypted: false,
      txHash,
      rootHash,
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
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Monologue API failed: HTTP ${res.status}`);
      }
      if (data.answer) {
        set({ activeMonologue: data.answer, isThinking: false });
        get().addLog(
          agentId,
          "THINK",
          data.answer
        );
      } else {
        set({ isThinking: false });
      }
    } catch (err: any) {
      // Monologue failures are non-critical — AI thought bubbles are cosmetic.
      // Log the warning but never halt the game over a failed monologue.
      console.warn("[0G Compute] Monologue fetch failed (non-fatal):", err?.message || String(err));
      set({ isThinking: false, activeMonologue: null });
    }
  },
}));
