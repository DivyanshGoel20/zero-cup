"use client";

import { useEffect, useState, useMemo } from "react";
import { useGameStore } from "@/lib/store/gameStore";
import { useUIStore, type ActivePanel } from "@/lib/store/uiStore";
import { Header } from "./components/ui/Header";
import { GameBoard } from "./components/board/GameBoard";
import { DiceDisplay } from "./components/ui/DiceDisplay";
import { ActivityFeed } from "./components/spectator/ActivityFeed";
import { SuspicionMeter } from "./components/spectator/SuspicionMeter";
import { DetectiveCard } from "./components/spectator/DetectiveCard";
import { ConspiracyWeb } from "./components/spectator/ConspiracyWeb";
import { DETECTIVES, DETECTIVE_BY_ID, WEAPON_BY_ID, WEAPONS, ROOMS } from "@/lib/game/constants";
import type { DetectiveId, WeaponId, RoomId, Position, Card, CustomDetectiveConfig } from "@/lib/game/types";
import { runDeductionAnalysis, checkAIAccusationDecision } from "@/lib/game/deduction";
import { getReachableCells, findPath } from "@/lib/game/board";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Activity, Users, HelpCircle, AlertTriangle } from "lucide-react";
import { soundManager } from "@/lib/game/sound";

const getCardDetails = (id: string) => {
  const cleanId = id.toUpperCase();
  if (DETECTIVE_BY_ID[cleanId]) {
    return {
      type: "SUSPECT",
      icon: "👤",
      color: "text-[#a78bfa] border-[#a78bfa]/20",
      image: `/detective_${cleanId.toLowerCase()}.png`
    };
  }
  if (WEAPON_BY_ID[cleanId]) {
    let suffix = cleanId.toLowerCase();
    if (suffix.includes("pistol")) suffix = "pistol";
    else if (suffix.includes("opener")) suffix = "opener";
    else if (suffix.includes("strychnine")) suffix = "strychnine";
    else if (suffix.includes("clock")) suffix = "clock";
    else if (suffix.includes("tie")) suffix = "tie";
    else if (suffix.includes("cane")) suffix = "cane";

    return {
      type: "WEAPON",
      icon: "🗡️",
      color: "text-[#f59e0b] border-[#f59e0b]/20",
      image: `/weapon_${suffix}.png`
    };
  }
  const ROOM_IDS = [
    "BILLIARD_ROOM",
    "CONSERVATORY",
    "LIBRARY",
    "WINE_CELLAR",
    "GRAND_FOYER",
    "MASTER_BEDROOM",
    "KITCHEN",
    "DINING_HALL",
    "SECRET_STUDY"
  ];
  if (ROOM_IDS.includes(cleanId)) {
    return {
      type: "ROOM",
      icon: "🚪",
      color: "text-[#06b6d4] border-[#06b6d4]/20",
      image: `/room_${cleanId.toLowerCase()}.png`
    };
  }
  return {
    type: "ROOM",
    icon: "🚪",
    color: "text-[#06b6d4] border-[#06b6d4]/20",
    image: "/room_card_bg.png"
  };
};

export default function Home() {
  const {
    status,
    actionState,
    detectives,
    detectiveOrder,
    currentDetectiveIndex,
    diceRoll,
    movementPath,
    movementStep,
    notebooks,
    confidence,
    log,
    winner,
    round,
    envelope,
    initGame,
    rollDiceAction,
    stayInRoomAction,
    stepMovement,
    makeSuggestion,
    makeAccusation,
    advanceTurn,
    fetchAIMonologue,
    isThinking,
    activeMonologue,
    isSyncing,
    syncMessage,
    error,
    derivedAddress,
    humanDetectiveId,
    disprovalPending,
    moveHumanAction,
    makeHumanSuggestion,
    resolveHumanDisproval,
  } = useGameStore();

  const {
    msPerStep,
    activePanel,
    isDiceAnimating,
    setDiceAnimating,
    setActivePanel,
    showWinnerReveal,
    setShowWinnerReveal,
    isPaused,
    setPaused,
  } = useUIStore();

  // Local state for single-player interactions
  const [selectedRole, setSelectedRole] = useState<DetectiveId | "spectator">("spectator");
  const [setupStep, setSetupStep] = useState<"modes" | "characters">("modes");
  const [suggestionSuspect, setSuggestionSuspect] = useState<DetectiveId>("VANCE");
  const [suggestionWeapon, setSuggestionWeapon] = useState<WeaponId>("PEARL_PISTOL");
  const [showAccusationModal, setShowAccusationModal] = useState(false);
  const [accusationSuspect, setAccusationSuspect] = useState<DetectiveId>("VANCE");
  const [accusationWeapon, setAccusationWeapon] = useState<WeaponId>("PEARL_PISTOL");
  const [accusationRoom, setAccusationRoom] = useState<RoomId>("GRAND_FOYER");

  // Local state for tracking exit door selection when human starts turn inside a room
  const [selectedDoor, setSelectedDoor] = useState<Position | null>(null);

  // Reset selected door when turn changes or action state resets
  useEffect(() => {
    setSelectedDoor(null);
  }, [currentDetectiveIndex, actionState]);

  // Local state for Custom Detective Creator
  const [customDetective, setCustomDetective] = useState<CustomDetectiveConfig | null>(null);
  const [isEditingCustomDetective, setIsEditingCustomDetective] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [customTargetId, setCustomTargetId] = useState<DetectiveId>("VANCE");
  const [isParsingPersona, setIsParsingPersona] = useState(false);
  const [parsingError, setParsingError] = useState<string | null>(null);

  // Local state for manual interactive clue notebook checklist (cycles: POSSIBLE -> ELIMINATED -> REVIEW -> POSSIBLE)
  const [manualNotebook, setManualNotebook] = useState<Record<string, "POSSIBLE" | "ELIMINATED" | "REVIEW" >> (() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("enigma_manual_notebook");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {}
      }
    }
    const defaultState: Record<string, "POSSIBLE" | "ELIMINATED" | "REVIEW"> = {};
    DETECTIVES.forEach((d) => { defaultState[d.id] = "POSSIBLE"; });
    WEAPONS.forEach((w) => { defaultState[w.id] = "POSSIBLE"; });
    ROOMS.forEach((r) => { defaultState[r.id] = "POSSIBLE"; });
    return defaultState;
  });

  // Save manual notebook to localStorage
  useEffect(() => {
    localStorage.setItem("enigma_manual_notebook", JSON.stringify(manualNotebook));
  }, [manualNotebook]);

  // Tab selector for single player desk: checklist or conspiracy web
  const [deskTab, setDeskTab] = useState<"checklist" | "conspiracy">("checklist");

  // Pre-fill manual notebook with user's starting hand when game starts
  useEffect(() => {
    if (status === "playing" && humanDetectiveId) {
      const humanDet = detectives.find((d) => d.id === humanDetectiveId);
      if (humanDet) {
        setManualNotebook((prev) => {
          const updated = { ...prev };
          humanDet.cards.forEach((card) => {
            updated[card.id] = "ELIMINATED"; // Hold it in our hand, so cross it out!
          });
          return updated;
        });
      }
    }
  }, [status, humanDetectiveId, detectives]);

  // Fallback active panel if human playing and on suspicion
  useEffect(() => {
    if (humanDetectiveId && activePanel === "suspicion") {
      setActivePanel("feed");
    }
  }, [humanDetectiveId, activePanel, setActivePanel]);

  // Initialize soundManager on first user interaction
  useEffect(() => {
    const handleInteraction = () => {
      soundManager.init();
      // Remove listeners once initialized
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
    };

    window.addEventListener("click", handleInteraction);
    window.addEventListener("keydown", handleInteraction);
    window.addEventListener("touchstart", handleInteraction);

    return () => {
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("touchstart", handleInteraction);
    };
  }, []);

  // Manage ambient soundtrack loop
  useEffect(() => {
    if (status === "playing") {
      soundManager.init();
      if (!soundManager.getIsMutedMusic()) {
        soundManager.startMusic();
      }
    } else if (status === "finished") {
      soundManager.stopMusic();
    }
  }, [status]);

  // Reset helper
  const handleBeginGame = () => {
    const defaultState: Record<string, "POSSIBLE" | "ELIMINATED" | "REVIEW"> = {};
    DETECTIVES.forEach((d) => { defaultState[d.id] = "POSSIBLE"; });
    WEAPONS.forEach((w) => { defaultState[w.id] = "POSSIBLE"; });
    ROOMS.forEach((r) => { defaultState[r.id] = "POSSIBLE"; });
    setManualNotebook(defaultState);
    initGame(selectedRole === "spectator" ? null : selectedRole, customDetective);
  };

  const handleSelectSpectator = () => {
    setSelectedRole("spectator");
    const defaultState: Record<string, "POSSIBLE" | "ELIMINATED" | "REVIEW"> = {};
    DETECTIVES.forEach((d) => { defaultState[d.id] = "POSSIBLE"; });
    WEAPONS.forEach((w) => { defaultState[w.id] = "POSSIBLE"; });
    ROOMS.forEach((r) => { defaultState[r.id] = "POSSIBLE"; });
    setManualNotebook(defaultState);
    initGame(null, customDetective);
  };

  const handleSelectSinglePlayerMode = () => {
    setSelectedRole("VANCE");
    setSetupStep("characters");
  };

  const handleParseCustomDetective = async () => {
    if (!customPrompt.trim()) {
      setParsingError("Please enter a description for the detective's strategy and personality.");
      return;
    }
    setIsParsingPersona(true);
    setParsingError(null);
    try {
      const res = await fetch("/api/inference/parse-persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: customPrompt }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.decision) {
        throw new Error(data.error || "Failed to analyze personality. Check network connection.");
      }
      
      const { name, movementStyle, bluffRate, accusationRiskLimit, isOffensive } = data.decision;
      
      if (isOffensive) {
        setParsingError("The custom description prompt was flagged as inappropriate. Please modify your text.");
        setIsParsingPersona(false);
        return;
      }
      
      setCustomDetective({
        targetAgentId: customTargetId,
        customName: customName.trim() || name,
        personalityPrompt: customPrompt.trim(),
        movementStyle,
        bluffRate,
        accusationRiskLimit,
      });
      setIsEditingCustomDetective(false);
    } catch (err: any) {
      console.error("[Parse custom detective failed]", err);
      setParsingError(err?.message || String(err));
    } finally {
      setIsParsingPersona(false);
    }
  };

  const toggleManualCard = (id: string) => {
    setManualNotebook((prev) => {
      const current = prev[id] || "POSSIBLE";
      let next: "POSSIBLE" | "ELIMINATED" | "REVIEW" = "POSSIBLE";
      if (current === "POSSIBLE") next = "ELIMINATED";
      else if (current === "ELIMINATED") next = "REVIEW";
      else next = "POSSIBLE";
      return { ...prev, [id]: next };
    });
  };

  // Helper for current active detective
  const activeDetectiveId = detectiveOrder[currentDetectiveIndex];
  const activeDetective = detectives.find((d) => d.id === activeDetectiveId);

  const getDetName = (id: DetectiveId) => {
    if (status === "playing" || status === "finished") {
      const found = detectives.find((d) => d.id === id);
      if (found) return found.name;
    }
    if (customDetective && customDetective.targetAgentId === id) {
      return customDetective.customName;
    }
    return DETECTIVE_BY_ID[id]?.name || id;
  };

  const isHumanTurn = activeDetectiveId === humanDetectiveId;
  const isHumanMoving = isHumanTurn && actionState === "moving" && movementPath.length === 0;

  const reachableCells = useMemo(() => {
    if (!isHumanMoving || !activeDetective || diceRoll === null) {
      return [];
    }

    if (activeDetective.currentRoom) {
      const roomConfig = ROOMS.find((r) => r.id === activeDetective.currentRoom);
      const doors = roomConfig ? [...roomConfig.doors] : [];

      if (!selectedDoor) {
        // Highlight all doors of the room AND all cells reachable from ANY of those doors within diceRoll steps
        const combined: Position[] = [];
        doors.forEach((door) => {
          if (!combined.some((c) => c.x === door.x && c.y === door.y)) {
            combined.push(door);
          }
          const cellsFromDoor = getReachableCells(door, diceRoll);
          cellsFromDoor.forEach((cell) => {
            if (!combined.some((c) => c.x === cell.x && c.y === cell.y)) {
              combined.push(cell);
            }
          });
        });
        return combined;
      } else {
        // Highlight cells reachable from the selected door + the doors themselves (to switch exits)
        const cellsFromDoor = getReachableCells(selectedDoor, diceRoll);
        const combined = [...cellsFromDoor];
        doors.forEach((d) => {
          if (!combined.some((c) => c.x === d.x && c.y === d.y)) {
            combined.push(d);
          }
        });
        return combined;
      }
    } else {
      return getReachableCells(activeDetective.position, diceRoll);
    }
  }, [isHumanMoving, activeDetective, diceRoll, selectedDoor]);

  // Note: key pairs are generated inside the store's initGame action

  // 3. Automatic simulation loop
  useEffect(() => {
    if (status !== "playing") return;
    if (isSyncing || error || isPaused || disprovalPending) return; // Halt loop on syncing, integration error, paused, or human disproval

    // If active detective is human, block automatic simulation actions
    if (activeDetectiveId === humanDetectiveId) {
      if (actionState === "moving" && movementPath.length > 0) {
        // Let step animation complete
      } else {
        return;
      }
    }

    let timer: NodeJS.Timeout;

    if (actionState === "idle") {
      const activeId = detectiveOrder[currentDetectiveIndex];
      const detective = detectives.find((d) => d.id === activeId);
      const notebook = notebooks[activeId];

      const shouldAIStay =
        activeId !== humanDetectiveId &&
        detective?.currentRoom &&
        notebook &&
        notebook.rooms[detective.currentRoom] === "POSSIBLE";

      if (shouldAIStay) {
        timer = setTimeout(() => {
          stayInRoomAction();
        }, msPerStep * 2.5);
      } else {
        // Step A: Wait briefly, then animate & roll dice
        timer = setTimeout(() => {
          setDiceAnimating(true);
          // Wait 700ms for dice animation, then complete roll
          timer = setTimeout(() => {
            setDiceAnimating(false);
            rollDiceAction();
          }, 700);
        }, msPerStep * 2.5);
      }
    } else if (actionState === "moving") {
      // Step B: Traverse path step-by-step
      timer = setTimeout(() => {
        stepMovement();
      }, msPerStep);
    } else if (actionState === "suggesting") {
      // Step C: Choose and process suggestion (decision choice is handled by Qwen inside makeSuggestion)
      timer = setTimeout(() => {
        makeSuggestion();
      }, msPerStep * 4);
    } else if (actionState === "accusing") {
      // Step D: Solve and execute final accusation
      timer = setTimeout(() => {
        const activeId = detectiveOrder[currentDetectiveIndex];
        const notebook = notebooks[activeId];
        if (notebook) {
          const solution = activeId === humanDetectiveId
            ? runDeductionAnalysis(notebook)
            : checkAIAccusationDecision(activeId, notebook, round);
          if (solution) {
            makeAccusation(solution);
          } else {
            advanceTurn();
          }
        }
      }, msPerStep * 5);
    } else if (actionState === "next_turn_pending") {
      // Step E: Wait before moving to next player
      timer = setTimeout(() => {
        advanceTurn();
      }, msPerStep * 3);
    }

    return () => {
      clearTimeout(timer);
    };
  }, [
    status,
    actionState,
    currentDetectiveIndex,
    movementStep,
    msPerStep,
    detectives,
    detectiveOrder,
    notebooks,
    rollDiceAction,
    stepMovement,
    makeSuggestion,
    makeAccusation,
    advanceTurn,
    setDiceAnimating,
    isSyncing,
    error,
    isPaused,
    humanDetectiveId,
    activeDetectiveId,
    movementPath.length,
    disprovalPending,
  ]);

  // 4. Trigger modal reveal when game finishes
  useEffect(() => {
    if (status === "finished" && winner) {
      setShowWinnerReveal(true);
    }
  }, [status, winner, setShowWinnerReveal]);

  // Status message text
  const getStatusMessage = () => {
    if (status === "finished") {
      return winner
        ? `${getDetName(winner)} solved the murder!`
        : "All detectives eliminated. Enigma remains a mystery.";
    }
    if (!activeDetective) return "Initializing board...";

    if (isThinking) {
      return `🧠 ${activeDetective.name} is reasoning (0G Compute)...`;
    }

    if (activeMonologue) {
      return `💬 ${activeDetective.name}: "${activeMonologue}"`;
    }

    switch (actionState) {
      case "idle":
        return `Awaiting roll for ${activeDetective.name}...`;
      case "rolling":
        return `${activeDetective.name} is shaking the dice...`;
      case "moving":
        if (isHumanTurn && activeDetective.currentRoom && movementPath.length === 0) {
          return selectedDoor
            ? `Exiting via door (${selectedDoor.x}, ${selectedDoor.y}). Select a highlighted tile to move.`
            : `Exit the room: Select which door to walk out from.`;
        }
        return `${activeDetective.name} is walking hallways (${movementStep}/${movementPath.length - 1})...`;
      case "suggesting":
        return `${activeDetective.name} is gathering clues in the ${activeDetective.currentRoom?.replace(/_/g, " ")}...`;
      case "accusing":
        return `⚠️ ${activeDetective.name} is preparing a final accusation!`;
      case "next_turn_pending":
        return `Turn complete. Awaiting next investigator...`;
      default:
        return "Game in progress...";
    }
  };

  if (status === "initializing") {
    return (
      <div className="flex flex-col min-h-screen text-[#f1f5f9] font-sans selection:bg-[#b89255] selection:text-black">
        <Header />
        <main className="flex-1 flex items-center justify-center p-6 max-w-4xl mx-auto">
          <div className="glass-panel p-8 shadow-2xl w-full text-center space-y-8 relative overflow-hidden border border-white/5">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#b89255] via-[#8a6a30] to-[#b89255]" />
            
            {/* Logo area */}
            <div className="space-y-4 flex flex-col items-center">
              <img
                src="/logo.png"
                alt="Enigma Logo"
                className="w-24 h-24 object-contain rounded-2xl border border-[#b89255]/20 shadow-xl shadow-black/40 hover:scale-105 transition-transform duration-300"
              />
              <h2 className="text-4xl font-extrabold tracking-widest text-[#b89255] serif-title uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                Enigma
              </h2>
              <p className="text-base text-[#cbd5e1] serif-body italic max-w-2xl mx-auto leading-relaxed">
                A 100% 0G-native deduction board game where five rival AI detective agents race to solve the Enigma murder, using hybrid-encrypted clues stored on 0G Storage and turn state anchored to the 0G Chain.
              </p>
            </div>

            {/* Content area: loader OR modes OR character selection */}
            <div className="pt-2">
              {isSyncing ? (
                (() => {
                  const getLoaderProgress = () => {
                    const msg = syncMessage || "";
                    if (msg.includes("Generating RSA")) return { pct: 25, activeStep: 0 };
                    if (msg.includes("Dealing cards")) return { pct: 50, activeStep: 1 };
                    if (msg.includes("Encrypting and uploading")) return { pct: 75, activeStep: 2 };
                    if (msg.includes("Anchoring game setup")) return { pct: 95, activeStep: 3 };
                    return { pct: 10, activeStep: 0 };
                  };

                  const { pct, activeStep } = getLoaderProgress();
                  const steps = [
                    "Generate Secure RSA-OAEP Key Pairs",
                    "Shuffle Clue Deck & Deal Cards",
                    "Store Encrypted Clues on 0G Storage",
                    "Anchor Turn Registries to 0G Chain"
                  ];

                  return (
                    <div className="max-w-md mx-auto space-y-6 text-left bg-black/45 p-6 rounded-2xl border border-white/5 shadow-2xl relative">
                      {/* Glow Header */}
                      <div className="flex items-center justify-between border-b border-white/5 pb-3">
                        <span className="text-xs font-mono text-[#cbd5e1] font-semibold uppercase tracking-wider">0G Cryptographic Setup</span>
                        <span className="text-sm font-mono text-[#b89255] font-black">{pct}%</span>
                      </div>

                      {/* Step list */}
                      <div className="space-y-3.5">
                        {steps.map((label, idx) => {
                          const isDone = idx < activeStep;
                          const isActive = idx === activeStep;
                          return (
                            <div key={label} className="flex items-center gap-3 text-xs font-mono">
                              {isDone ? (
                                <span className="w-5 h-5 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 flex items-center justify-center font-bold text-[9px] shrink-0">
                                  ✓
                                </span>
                              ) : isActive ? (
                                <span className="w-5 h-5 rounded-full bg-[#b89255]/10 border border-[#b89255]/30 text-[#b89255] flex items-center justify-center font-bold text-[9px] shrink-0 animate-pulse">
                                  ⏳
                                </span>
                              ) : (
                                <span className="w-5 h-5 rounded-full bg-white/[0.02] border border-white/5 text-gray-600 flex items-center justify-center font-medium text-[8px] shrink-0">
                                  {idx + 1}
                                </span>
                              )}
                              <span className={`${isDone ? "text-gray-400 line-through" : isActive ? "text-white font-semibold" : "text-gray-600"}`}>
                                {label}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Premium Glowing Gold Bar */}
                      <div className="h-2 w-full rounded-full bg-white/[0.04] overflow-hidden relative border border-white/5 mt-4">
                        <motion.div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#b89255] via-[#e0b571] to-[#b89255] shadow-[0_0_8px_rgba(184,146,85,0.4)]"
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5, ease: "easeInOut" }}
                        />
                      </div>

                      {/* Status subtitle */}
                      <div className="text-[10px] font-mono text-[#64748b] text-center italic mt-2 animate-pulse truncate">
                        {syncMessage}
                      </div>
                    </div>
                  );
                })()
              ) : setupStep === "modes" ? (
                <div className="space-y-6">
                  <h3 className="text-xs font-mono font-bold text-[#b89255] uppercase tracking-wider">
                    Select Game Mode
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
                    {/* Spectator card */}
                    <motion.div
                      whileHover={{ y: -4, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleSelectSpectator}
                      className="cursor-pointer glass-panel p-6 rounded-2xl border border-white/5 hover:border-[#b89255] bg-gradient-to-b from-[#111827]/80 to-black/90 shadow-lg hover:shadow-[0_0_20px_rgba(184,146,85,0.15)] transition-all duration-300 text-left flex flex-col justify-between min-h-[160px] relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4 text-3xl opacity-10">👁️</div>
                      <div className="space-y-3">
                        <h4 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                          <span className="text-[#b89255]">👁️</span> Spectator Mode
                        </h4>
                        <p className="text-xs text-[#94a3b8] leading-relaxed">
                          Sit back and observe. Five elite AI detectives search the manor, share RSA-encrypted clues, and compete on-chain in real-time.
                        </p>
                      </div>
                      <div className="text-[10px] font-mono text-[#b89255] font-bold mt-4 flex items-center gap-1 group">
                        <span>Launch AI Simulation</span>
                        <span className="transform translate-x-0 group-hover:translate-x-1 transition-transform">→</span>
                      </div>
                    </motion.div>

                    {/* Single Player card */}
                    <motion.div
                      whileHover={{ y: -4, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleSelectSinglePlayerMode}
                      className="cursor-pointer glass-panel p-6 rounded-2xl border border-white/5 hover:border-[#b89255] bg-gradient-to-b from-[#111827]/80 to-black/90 shadow-lg hover:shadow-[0_0_20px_rgba(184,146,85,0.15)] transition-all duration-300 text-left flex flex-col justify-between min-h-[160px] relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4 text-3xl opacity-10">🕵️</div>
                      <div className="space-y-3">
                        <h4 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                          <span className="text-[#b89255]">🕵️</span> Single Player Mode
                        </h4>
                        <p className="text-xs text-[#94a3b8] leading-relaxed">
                          Take active control of a detective. Explore rooms, keep a secret checklist, make suggestions, and deduce the solution to win.
                        </p>
                      </div>
                      <div className="text-[10px] font-mono text-[#b89255] font-bold mt-4 flex items-center gap-1 group">
                        <span>Choose Character & Play</span>
                        <span className="transform translate-x-0 group-hover:translate-x-1 transition-transform">→</span>
                      </div>
                    </motion.div>
                  </div>

                  {/* Custom Detective Setup Button */}
                  <div className="pt-4 flex flex-col items-center">
                    {customDetective ? (
                      <div className="flex flex-col items-center bg-[#b89255]/5 border border-[#b89255]/30 px-6 py-3.5 rounded-2xl max-w-md w-full relative">
                        <div className="text-[10px] font-mono font-bold text-[#b89255] uppercase tracking-wider">
                          ✨ Custom AI Agent Active
                        </div>
                        <div className="text-xs font-bold text-white mt-1">
                          {customDetective.customName} <span className="text-[10px] text-gray-400 font-normal">replaces {customDetective.targetAgentId}</span>
                        </div>
                        <div className="text-[9px] text-gray-400 font-mono mt-1 space-x-2">
                          <span>Style: {customDetective.movementStyle}</span>
                          <span>•</span>
                          <span>Bluff: {Math.round(customDetective.bluffRate * 100)}%</span>
                          <span>•</span>
                          <span>Accuse: {Math.round(customDetective.accusationRiskLimit * 100)}%</span>
                        </div>
                        <div className="flex gap-4 mt-3">
                          <button
                            onClick={() => {
                              setCustomName(customDetective.customName);
                              setCustomPrompt(customDetective.personalityPrompt);
                              setCustomTargetId(customDetective.targetAgentId);
                              setIsEditingCustomDetective(true);
                            }}
                            className="text-[9px] text-[#cbd5e1] hover:text-[#b89255] font-bold font-mono transition-colors uppercase tracking-wider bg-white/[0.03] border border-white/5 px-2.5 py-1 rounded-md"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setCustomDetective(null)}
                            className="text-[9px] text-red-400 hover:text-red-300 font-bold font-mono transition-colors uppercase tracking-wider bg-red-950/20 border border-red-500/25 px-2.5 py-1 rounded-md"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setCustomName("");
                          setCustomPrompt("");
                          setCustomTargetId("VANCE");
                          setParsingError(null);
                          setIsEditingCustomDetective(true);
                        }}
                        className="px-5 py-2.5 rounded-xl font-bold font-mono text-[10px] tracking-wider uppercase bg-white/[0.03] border border-[#b89255]/20 hover:border-[#b89255]/40 hover:bg-[#b89255]/5 text-[#cbd5e1] hover:text-white transition-all cursor-pointer"
                      >
                        ⚙️ Customize AI Detective Opponent
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex justify-between items-center max-w-3xl mx-auto px-1">
                    <button
                      onClick={() => setSetupStep("modes")}
                      className="flex items-center gap-1.5 text-xs text-[#94a3b8] hover:text-white font-mono font-bold transition-colors cursor-pointer bg-white/[0.03] border border-white/5 px-3 py-1.5 rounded-lg"
                    >
                      ← Back to Modes
                    </button>
                    <h3 className="text-xs font-mono font-bold text-[#b89255] uppercase tracking-wider">
                      Select Your Detective
                    </h3>
                    <div className="w-24 hidden sm:block" />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 max-w-3xl mx-auto">
                    {DETECTIVES.map((det) => (
                      <motion.div
                        key={det.id}
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedRole(det.id)}
                        className={`cursor-pointer glass-panel p-3 rounded-xl border transition-all duration-300 text-left flex flex-col justify-between h-28 relative ${
                          selectedRole === det.id
                            ? "border-[#b89255] bg-[#b89255]/5 shadow-[0_0_15px_rgba(184,146,85,0.2)]"
                            : "border-white/5 hover:border-white/10 bg-white/[0.01]"
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: det.color }}
                            />
                            <span className="text-[11px] font-bold text-white tracking-wide truncate">
                              {getDetName(det.id)}
                            </span>
                          </div>
                        </div>
                        <p className="text-[9px] text-[#94a3b8] leading-relaxed line-clamp-3">
                          {det.personality}
                        </p>
                        {selectedRole === det.id && (
                          <div className="absolute bottom-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-[#b89255]" />
                        )}
                      </motion.div>
                    ))}
                  </div>

                  <div className="pt-4 flex flex-col items-center">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleBeginGame}
                      className="px-8 py-4 rounded-xl font-bold font-mono text-xs tracking-widest uppercase bg-gradient-to-r from-[#b89255] to-[#8a6a30] text-[#0f0a05] border border-[#d4aa6a]/40 shadow-xl shadow-black/50 hover:shadow-[#b89255]/25 transition-all cursor-pointer active:scale-95"
                    >
                      Play as {selectedRole !== "spectator" ? getDetName(selectedRole) : ""}
                    </motion.button>
                    <p className="text-[10px] text-[#64748b] font-mono mt-3">
                      *You will control {selectedRole !== "spectator" ? getDetName(selectedRole) : ""}, make moves, suggest clues, and disprove cards yourself.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
        {isEditingCustomDetective && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="glass-panel p-6 max-w-lg w-full relative border border-white/10 shadow-2xl space-y-5 overflow-hidden text-left bg-[#080b14]/95">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#b89255] via-[#e0b571] to-[#b89255]" />
            
            <div className="space-y-1.5">
              <h3 className="text-lg font-extrabold tracking-wider text-[#b89255] serif-title uppercase text-[#b89255]">
                Custom Detective Dossier
              </h3>
              <p className="text-xs text-[#94a3b8] leading-relaxed">
                Provide custom strategic instructions, tactics, and personality monologues to override one of the AI agents.
              </p>
            </div>

            <div className="space-y-4 text-left">
              {/* Target Dropdown */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold text-[#b89255] uppercase tracking-wider block">
                  Select Detective to Override
                </label>
                <select
                  value={customTargetId}
                  onChange={(e) => setCustomTargetId(e.target.value as DetectiveId)}
                  className="w-full bg-[#05070a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#b89255] transition-all cursor-pointer font-mono"
                >
                  {DETECTIVES.map((d) => (
                    <option key={d.id} value={d.id}>
                      Replace {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Name field */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold text-[#b89255] uppercase tracking-wider block">
                  Detective Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Inspector Poirot (Leave blank to parse from prompt)"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full bg-[#05070a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#b89255] transition-all"
                />
              </div>

              {/* Prompt textarea */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold text-[#b89255] uppercase tracking-wider flex justify-between">
                  <span>Strategy & Personality Prompt</span>
                  <span className="text-gray-500 font-normal">Max 250 characters</span>
                </label>
                <textarea
                  rows={4}
                  maxLength={250}
                  placeholder="Describe strategy (aggressive, methodical, bluffing) and speech persona..."
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full bg-[#05070a] border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#b89255] transition-all resize-none leading-relaxed"
                />
                
                {/* Templates checklist for quick copy */}
                <div className="pt-1.5">
                  <div className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">Quick Suggestions:</div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <button
                      onClick={() => setCustomPrompt("An eccentric, orderly detective who refers to himself in the third person. Tactically follows other detectives but is extremely cautious and only accuses at 100% certainty.")}
                      className="text-[9px] bg-white/[0.02] border border-white/5 hover:border-[#b89255]/40 px-2 py-1 rounded text-gray-400 hover:text-white transition-colors cursor-pointer"
                    >
                      French Poirot
                    </button>
                    <button
                      onClick={() => setCustomPrompt("A chaotic, maniacal wildcard who treats the case as a game. Speaks in cryptical jokes. Tactically, he bluffs constantly and makes risky guesses at 50% certainty.")}
                      className="text-[9px] bg-white/[0.02] border border-white/5 hover:border-[#b89255]/40 px-2 py-1 rounded text-gray-400 hover:text-white transition-colors cursor-pointer"
                    >
                      Chaotic Joker
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {parsingError && (
              <div className="bg-red-950/40 border border-red-500/20 text-red-200 text-[11px] p-3 rounded-xl font-mono flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                <span>{parsingError}</span>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2 border-t border-white/5">
              <button
                disabled={isParsingPersona}
                onClick={() => setIsEditingCustomDetective(false)}
                className="px-4 py-2 border border-white/10 hover:border-white/20 text-xs font-mono font-bold text-[#cbd5e1] hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={isParsingPersona}
                onClick={handleParseCustomDetective}
                className="px-5 py-2 bg-gradient-to-r from-[#b89255] to-[#8a6a30] text-[#0f0a05] text-xs font-mono font-bold rounded-lg border border-[#d4aa6a]/40 shadow-md hover:shadow-[#b89255]/15 transition-all cursor-pointer flex items-center gap-1.5"
              >
                {isParsingPersona ? (
                  <>
                    <span className="w-3 h-3 border-2 border-[#0f0a05] border-t-transparent rounded-full animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  "Apply Strategy"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen text-[#f1f5f9] font-sans selection:bg-[#b89255] selection:text-black">
      {/* Header bar */}
      <Header />

      {/* Main content container */}
      <main className="flex-1 p-4 md:p-6 lg:p-8 w-full max-w-[1600px] mx-auto flex flex-col gap-6">
        
        {/* Error State Warning Block */}
        {error && (
          <div className="bg-red-950/80 border border-red-500/40 rounded-2xl p-5 text-red-200 flex flex-col gap-3 font-mono text-sm relative shadow-2xl backdrop-blur-md">
            <div className="absolute top-0 left-0 right-0 h-1 bg-red-600 rounded-t-2xl" />
            <div className="flex items-center gap-2 text-red-400 font-bold text-base animate-pulse">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>0G INTEGRATION ERROR — GAME HALTED</span>
            </div>
            <p className="text-red-300 font-sans leading-relaxed">{error}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-3 border-t border-red-500/20 text-xs text-red-400/80 items-center">
              <div>
                Derived Address: <code className="bg-black/40 px-1.5 py-0.5 rounded text-white select-all">{derivedAddress}</code>
              </div>
              <div>
                Faucet Link:{" "}
                <a
                  href="https://faucet.0g.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-[#b89255] hover:text-[#e0b571] font-bold"
                >
                  faucet.0g.ai ↗
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Syncing Overlay Status indicator */}
        {isSyncing && (
          <div className="bg-blue-950/40 border border-blue-500/20 rounded-2xl p-4 text-blue-200 flex items-center justify-between font-mono text-xs relative shadow-md backdrop-blur-md animate-pulse">
            <div className="flex items-center gap-3">
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
              </span>
              <span>{syncMessage || "Syncing with 0G Network..."}</span>
            </div>
            <span className="text-[10px] text-blue-400/60 shrink-0">BLOCKING NEXT STEP</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch w-full">
        
        {/* Left Column: Board (50% Split) */}
        <section className="lg:col-span-1 flex flex-col gap-6 w-full self-start lg:sticky lg:top-6">
          <div className="glass-panel p-4 md:p-5 shadow-2xl flex flex-col items-center justify-start w-full">
            {/* Active turn header */}
            <div className="w-full flex items-center justify-between border-b border-white/5 pb-3 mb-4 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-[#b89255] animate-pulse" />
                <span className="text-[#cbd5e1] font-bold uppercase tracking-wider">Investigation Board</span>
              </div>
              <div className="flex items-center gap-3">
                {status === "playing" && (
                  <button
                    onClick={() => setPaused(!isPaused)}
                    className={`px-2.5 py-1 rounded border text-[9px] font-bold font-mono transition-all cursor-pointer flex items-center gap-1 active:scale-95 ${
                      isPaused
                        ? "bg-[#10b981]/10 border-[#10b981]/30 text-[#10b981] hover:bg-[#10b981]/20 hover:border-[#10b981]/50"
                        : "bg-[#f59e0b]/10 border-[#f59e0b]/30 text-[#f59e0b] hover:bg-[#f59e0b]/20 hover:border-[#f59e0b]/50"
                    }`}
                  >
                    {isPaused ? "▶ Resume" : "⏸ Pause"}
                  </button>
                )}
                {activeDetective && (
                  <span style={{ color: activeDetective.color }} className="font-bold uppercase tracking-wider">
                    {activeDetective.name}&apos;s Turn
                  </span>
                )}
              </div>
            </div>

            {/* Board renderer */}
            <div className="w-full max-w-[620px] xl:max-w-[700px] mx-auto transition-all">
              <GameBoard
                detectives={detectives}
                activeDetectiveId={activeDetectiveId}
                highlightedCells={
                  movementPath.length > 0
                    ? movementPath
                    : isHumanMoving
                    ? reachableCells
                    : []
                }
                onCellClick={(pos) => {
                  if (isHumanMoving && activeDetective && diceRoll !== null) {
                    if (activeDetective.currentRoom) {
                      const roomConfig = ROOMS.find((r) => r.id === activeDetective.currentRoom);
                      const isDoor = roomConfig?.doors.some((d) => d.x === pos.x && d.y === pos.y);

                      if (isDoor) {
                        if (!selectedDoor || selectedDoor.x !== pos.x || selectedDoor.y !== pos.y) {
                          // Select (or switch to) this door
                          setSelectedDoor(pos);
                        } else {
                          // Clicked the already selected door, execute movement to it
                          moveHumanAction(pos, selectedDoor);
                          setSelectedDoor(null);
                        }
                      } else {
                        // Clicked a reachable cell
                        let startDoor = selectedDoor;
                        if (!startDoor && roomConfig) {
                          // Find a door from which this cell is reachable within diceRoll steps
                          const possibleDoors = roomConfig.doors.filter((d) => {
                            const p = findPath(d, pos);
                            return p && (p.length - 1) <= diceRoll;
                          });
                          if (possibleDoors.length > 0) {
                            startDoor = possibleDoors[0];
                          }
                        }
                        if (startDoor) {
                          moveHumanAction(pos, startDoor);
                          setSelectedDoor(null);
                        }
                      }
                    } else {
                      moveHumanAction(pos);
                    }
                  }
                }}
              />
            </div>

            {/* Turn status block */}
            <div className="w-full mt-6 bg-white/[0.02] border border-white/5 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[10px] text-[#475569] uppercase font-bold tracking-wider font-mono">
                  Current Action
                </div>
                <h3 className="text-sm font-semibold text-[#f1f5f9] mt-0.5 font-sans leading-snug">
                  {getStatusMessage()}
                </h3>
              </div>

              {/* Dice box */}
              <div className="shrink-0 flex flex-col items-center gap-3">
                {isHumanTurn && actionState === "idle" && activeDetective?.currentRoom && (
                  <button
                    disabled={isSyncing}
                    onClick={stayInRoomAction}
                    className="px-4 py-2 bg-[#b89255]/10 border border-[#b89255]/40 hover:border-[#b89255] text-[#b89255] hover:text-white font-bold font-mono text-[10px] tracking-wider uppercase rounded-xl transition-all hover:scale-102 active:scale-98 cursor-pointer w-full text-center"
                  >
                    🚪 Stay In Room
                  </button>
                )}
                <DiceDisplay
                  value={diceRoll}
                  isAnimating={isDiceAnimating}
                  onRoll={rollDiceAction}
                  disabled={actionState !== "idle" || status !== "playing" || !isHumanTurn}
                />
              </div>
            </div>

            {/* Human Active Action Desk */}
            {(isHumanTurn || (disprovalPending && disprovalPending.disproverId === humanDetectiveId)) && (
              <div className="w-full mt-4 glass-panel p-5 border border-[#b89255]/40 shadow-[0_0_25px_rgba(184,146,85,0.1)] relative overflow-hidden text-left">
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#b89255] to-transparent animate-pulse" />
                
                {/* Pending Disproval Interface */}
                {disprovalPending && disprovalPending.disproverId === humanDetectiveId ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#b89255] uppercase">
                      <HelpCircle className="w-4 h-4 animate-bounce" />
                      <span>🔍 Disprove Suggestion</span>
                    </div>
                    <p className="text-xs text-[#cbd5e1] leading-relaxed">
                      <strong>{getDetName(disprovalPending.suggesterId)}</strong> suggested that the murder was committed by{" "}
                      <strong>{getDetName(disprovalPending.suggestion.suspect)}</strong> with the{" "}
                      <strong>{disprovalPending.suggestion.weapon.replace(/_/g, " ")}</strong> in the{" "}
                      <strong>{disprovalPending.suggestion.room.replace(/_/g, " ")}</strong>.
                      <br />
                      <span className="text-[#94a3b8]">Select one of your matching clue cards to show them (encrypted):</span>
                    </p>
                    
                    <div className="flex flex-wrap gap-3 pt-2">
                      {disprovalPending.candidates.map((card) => {
                        const details = getCardDetails(card.id);
                        return (
                          <button
                            key={card.id}
                            disabled={isSyncing}
                            onClick={() => resolveHumanDisproval(card)}
                            className="border border-white/5 hover:border-[#b89255] rounded-xl p-3 text-left w-28 h-36 flex flex-col justify-between cursor-pointer transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none relative overflow-hidden bg-gradient-to-b from-slate-900 to-black shadow-lg"
                          >
                            {/* Card background artwork overlay */}
                            <div
                              className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-85"
                              style={{
                                backgroundImage: `url(${
                                  details.type === "SUSPECT"
                                    ? "/suspect_card_bg.png"
                                    : details.type === "WEAPON"
                                    ? "/weapon_card_bg.png"
                                    : "/room_card_bg.png"
                                })`
                              }}
                            />
                            {/* Dark gradient for text readability */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/25 pointer-events-none z-10" />

                            <div className={`flex justify-between items-center w-full z-20 text-[7px] font-mono font-bold uppercase tracking-wider ${
                              details.type === "SUSPECT" ? "text-[#a78bfa]" : details.type === "WEAPON" ? "text-[#f59e0b]" : "text-[#06b6d4]"
                            }`}>
                              <span>{details.type}</span>
                              <span className="text-[10px]">{details.icon}</span>
                            </div>
                            <div className="text-[16px] text-center w-full my-1 opacity-20 z-20">
                              {details.icon === "👤" ? "🕵️" : details.icon === "🗡️" ? "⚔️" : "🏛️"}
                            </div>
                            <div className="text-[8.5px] font-serif font-black uppercase text-center leading-tight tracking-wider text-white border-t border-white/10 pt-1.5 z-20 w-full px-0.5 break-words">
                              {details.type === "SUSPECT" ? getDetName(card.id as DetectiveId) : card.name.replace(/_/g, " ")}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  // Human Active Turn Interface
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#b89255] uppercase">
                        <Users className="w-4 h-4" />
                        <span>Your Turn: {activeDetective?.name}</span>
                      </div>
                      
                      {/* Accusation Button */}
                      <button
                        disabled={!activeDetective?.currentRoom}
                        onClick={() => {
                          if (activeDetective?.currentRoom) {
                            setAccusationRoom(activeDetective.currentRoom);
                            setShowAccusationModal(true);
                          }
                        }}
                        className={`px-3 py-1 text-[9px] font-bold font-mono tracking-wider uppercase transition-all rounded-lg border ${
                          activeDetective?.currentRoom
                            ? "bg-red-950/45 hover:bg-red-900/45 text-red-400 border-red-900/40 hover:border-red-500/50 cursor-pointer active:scale-95 animate-pulse"
                            : "bg-gray-950/40 text-gray-600 border-gray-900 cursor-not-allowed opacity-50"
                        }`}
                        title={activeDetective?.currentRoom ? "File an accusation" : "You must be inside a room to make an accusation"}
                      >
                        🚨 Accuse
                      </button>
                    </div>

                    {/* Step-specific controls */}
                    {actionState === "idle" && (
                      <div className="space-y-2">
                        <p className="text-xs text-[#cbd5e1] leading-relaxed">
                          Your turn has started. Click the dice roll button in the panel below to roll and calculate your path possibilities.
                        </p>
                      </div>
                    )}

                    {actionState === "moving" && movementPath.length === 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-[#cbd5e1] leading-relaxed">
                          You rolled a <strong className="text-[#b89255]">{diceRoll}</strong>. Select one of the highlighted cells on the board to move your character.
                        </p>
                        <div className="text-[10px] font-mono text-[#cbd5e1]/70 bg-black/30 p-2 rounded-lg border border-white/5">
                          📌 Reachable cells have gold borders. Click on any of them to travel.
                        </div>
                      </div>
                    )}

                    {actionState === "moving" && movementPath.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-[#cbd5e1] leading-relaxed animate-pulse">
                          Walking hallways... ({movementStep} / {movementPath.length - 1} steps completed)
                        </p>
                      </div>
                    )}

                    {actionState === "suggesting" && activeDetective?.currentRoom && (
                      <div className="space-y-4">
                        <p className="text-xs text-[#cbd5e1] leading-relaxed">
                          You are inside the <strong className="text-[#b89255]">{activeDetective.currentRoom.replace(/_/g, " ")}</strong>. You can make a suggestion to question other investigators.
                        </p>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Suspect dropdown */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-wider">Suspect</label>
                            <select
                              value={suggestionSuspect}
                              onChange={(e) => setSuggestionSuspect(e.target.value as DetectiveId)}
                              className="bg-[#0f172a] border border-white/10 rounded-lg p-2 text-xs font-semibold text-white focus:border-[#b89255] outline-none"
                            >
                              {DETECTIVES.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {getDetName(d.id)}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Weapon dropdown */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-wider">Weapon</label>
                            <select
                              value={suggestionWeapon}
                              onChange={(e) => setSuggestionWeapon(e.target.value as WeaponId)}
                              className="bg-[#0f172a] border border-white/10 rounded-lg p-2 text-xs font-semibold text-white focus:border-[#b89255] outline-none"
                            >
                              {WEAPONS.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <button
                          disabled={isSyncing}
                          onClick={() =>
                            makeHumanSuggestion({
                              suspect: suggestionSuspect,
                              weapon: suggestionWeapon,
                              room: activeDetective.currentRoom!,
                            })
                          }
                          className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-[#b89255] to-[#8a6a30] text-black font-bold font-mono text-[10px] tracking-wider uppercase border border-white/10 shadow-md cursor-pointer active:scale-95 disabled:opacity-50 disabled:pointer-events-none w-full text-center"
                        >
                          💡 Submit Suggestion
                        </button>
                      </div>
                    )}

                    {actionState === "next_turn_pending" && (
                      <div className="space-y-2">
                        <p className="text-xs text-[#cbd5e1] leading-relaxed">
                          Your turn is complete. Click the button below to hand over the magnifying glass to the next detective.
                        </p>
                        <button
                          disabled={isSyncing}
                          onClick={() => advanceTurn()}
                          className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-[#b89255] to-[#8a6a30] text-black font-bold font-mono text-[10px] tracking-wider uppercase border border-white/10 shadow-md cursor-pointer active:scale-95 disabled:opacity-50 disabled:pointer-events-none w-full text-center"
                        >
                          ✓ End Turn & Pass
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Spectator Panels (50% Split) */}
        <section className="lg:col-span-1 flex flex-col gap-6 h-full">
          <div className="glass-panel flicker-glow shadow-xl flex flex-col h-[700px] xl:h-[780px] overflow-hidden">
            {/* Panel Tabs Header */}
            <div className="flex border-b border-white/5 bg-black/10 rounded-t-2xl">
              {(humanDetectiveId === null ? (["feed", "suspicion", "detectives"] as const) : (["feed", "detectives"] as const)).map((tab) => {
                const getTabDetails = (t: typeof tab) => {
                  switch (t) {
                    case "feed":
                      return { label: "Events", icon: Activity };
                    case "suspicion":
                      return { label: "Suspicion", icon: HelpCircle };
                    case "detectives":
                      return { label: "Dossiers", icon: Users };
                  }
                };
                const details = getTabDetails(tab);
                const Icon = details.icon;

                return (
                  <button
                    key={tab}
                    onClick={() => setActivePanel(tab)}
                    className={`flex-1 py-3 flex flex-col items-center gap-1 text-[10px] uppercase font-semibold font-mono tracking-wider transition-colors border-b-2 ${
                      activePanel === tab
                        ? "text-[#b89255] border-[#b89255] bg-white/[0.01]"
                        : "text-[#475569] border-transparent hover:text-[#94a3b8]"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{details.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Panel body container */}
            <div className="flex-1 overflow-hidden">
              {activePanel === "feed" && <ActivityFeed log={log} />}
              {activePanel === "suspicion" && (
                <SuspicionMeter
                  confidence={confidence}
                  activeDetectiveId={activeDetectiveId}
                  eliminatedIds={detectives.filter((d) => d.eliminated).map((d) => d.id)}
                  detectives={detectives}
                  notebooks={notebooks}
                />
              )}
              {activePanel === "detectives" && (
                <div className="overflow-y-auto h-full p-4 space-y-4">
                  {detectives.map((det) => (
                    <DetectiveCard
                      key={det.id}
                      detective={det}
                      isActive={det.id === activeDetectiveId}
                      notebook={notebooks[det.id]}
                      confidence={confidence[det.id] ?? 0}
                      humanDetectiveId={humanDetectiveId}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
        </div>

        {/* Full-width Detective Desk (only visible in single-player mode when human playing) */}
        {status === "playing" && humanDetectiveId && (
          <section className="w-full mt-8 glass-panel p-6 border border-[#b89255]/40 shadow-2xl relative overflow-hidden text-left bg-black/35 backdrop-blur-md rounded-2xl">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#b89255] to-transparent animate-pulse" />
            
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Left Side: Your Secret Hand */}
              <div className="lg:w-1/3 space-y-4">
                <h3 className="text-sm font-mono font-bold text-[#b89255] uppercase tracking-wider flex items-center gap-2">
                  <span>🎴</span> Your Secret Clue Cards
                </h3>
                <p className="text-[10px] text-[#cbd5e1] leading-relaxed">
                  These are the cards dealt to you from the Enigma deck. Keep them safe. They are automatically crossed off in your manual notebook.
                </p>
                
                <div className="flex flex-wrap gap-3 pt-2">
                  {(() => {
                    const humanDet = detectives.find((d) => d.id === humanDetectiveId);
                    if (!humanDet) return <p className="text-xs text-gray-500 italic">No cards dealt</p>;
                    return humanDet.cards.map((card) => {
                      const details = getCardDetails(card.id);
                      return (
                        <motion.div
                          key={card.id}
                          whileHover={{ y: -4, scale: 1.05 }}
                          className="w-24 h-36 rounded-xl border relative flex flex-col justify-between p-2.5 shadow-xl bg-slate-950 overflow-hidden shrink-0 group"
                          style={{ borderColor: details.type === "SUSPECT" ? "rgba(167,139,250,0.35)" : details.type === "WEAPON" ? "rgba(245,158,11,0.35)" : "rgba(6,182,212,0.35)" }}
                        >
                          {/* Fullscreen Card Artwork */}
                          <div
                            className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-85 transition-transform duration-300 group-hover:scale-110"
                            style={{ backgroundImage: `url(${details.image})` }}
                          />
                          {/* Dark gradient overlay for top and bottom text readability */}
                          <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90 pointer-events-none z-10" />

                          {/* Top banner / icon */}
                          <div className={`flex items-center justify-between text-[9px] font-mono font-bold uppercase tracking-wider z-20 ${
                            details.type === "SUSPECT" ? "text-[#a78bfa]" : details.type === "WEAPON" ? "text-[#f59e0b]" : "text-[#06b6d4]"
                          }`}>
                            <span>{details.type}</span>
                            <span>{details.icon}</span>
                          </div>
                          
                          {/* Empty middle spacer */}
                          <div className="flex-1" />
                          
                          {/* Card name */}
                          <div className="text-[10px] font-serif font-black uppercase text-center leading-tight tracking-wider text-white border-t border-white/10 pt-1.5 z-20 w-full px-0.5 break-words">
                            {details.type === "SUSPECT" ? getDetName(card.id as DetectiveId) : card.name.replace(/_/g, " ")}
                          </div>
                        </motion.div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Right Side: Manual Deduction Checklist / Conspiracy Web */}
              <div className="flex-1 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 pb-2 gap-2">
                  <div className="flex items-center gap-4">
                    <h3 className="text-sm font-mono font-bold text-[#b89255] uppercase tracking-wider flex items-center gap-2">
                      <span>📝</span> Your Case Notebook
                    </h3>
                    <div className="flex rounded-lg bg-slate-950 p-0.5 border border-white/5">
                      <button
                        onClick={() => setDeskTab("checklist")}
                        className={`px-3 py-1 rounded-md text-[10px] font-mono font-bold transition-all cursor-pointer ${
                          deskTab === "checklist"
                            ? "bg-[#b89255]/20 text-[#b89255]"
                            : "text-[#cbd5e1]/60 hover:text-white"
                        }`}
                      >
                        Checklist
                      </button>
                      <button
                        onClick={() => setDeskTab("conspiracy")}
                        className={`px-3 py-1 rounded-md text-[10px] font-mono font-bold transition-all cursor-pointer ${
                          deskTab === "conspiracy"
                            ? "bg-[#b89255]/20 text-[#b89255]"
                            : "text-[#cbd5e1]/60 hover:text-white"
                        }`}
                      >
                        Conspiracy Web
                      </button>
                    </div>
                  </div>
                  {deskTab === "checklist" ? (
                    <div className="flex items-center gap-4 text-[9px] font-mono text-[#cbd5e1]/70">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-slate-800/50 border border-white/10" /> Possible Clue</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-950/20 border border-red-500/20" /> Crossed-out (Eliminated)</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-950/20 border border-amber-500/20" /> Under Review</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 text-[9px] font-mono text-[#cbd5e1]/70">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-[#ef4444] inline-block" /> Suspicion</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-[#10b981] inline-block" /> My Hand</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-[#3b82f6] inline-block" /> Rival</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-0.5 bg-[#d97706] inline-block" /> Solution</span>
                    </div>
                  )}
                </div>

                {deskTab === "checklist" ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
                    {/* Suspects Column */}
                    <div className="space-y-2 bg-black/25 p-3 rounded-2xl border border-white/[0.03]">
                      <div className="font-bold text-[#a78bfa] border-b border-white/5 pb-1.5 mb-2 uppercase text-[10px] tracking-wider flex justify-between items-center">
                        <span>Suspects</span>
                        <span className="text-[8px] text-gray-500">5 Cards</span>
                      </div>
                      
                      {DETECTIVES.map((d) => {
                        const status = manualNotebook[d.id] || "POSSIBLE";
                        return (
                          <div
                            key={d.id}
                            onClick={() => toggleManualCard(d.id)}
                            className={`flex items-center justify-between p-2 rounded-lg border transition-all duration-200 cursor-pointer ${
                              status === "ELIMINATED"
                                ? "bg-red-950/5 border-red-900/10 opacity-40 text-gray-500 line-through"
                                : status === "REVIEW"
                                ? "bg-amber-950/10 border-amber-500/30 text-amber-300 font-semibold"
                                : "bg-white/[0.01] border-white/5 hover:border-white/10 text-gray-200 font-semibold"
                            }`}
                          >
                            <span className="truncate max-w-[120px]">{getDetName(d.id)}</span>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-bold border shrink-0 uppercase ${
                              status === "ELIMINATED"
                                ? "bg-red-500/10 border-red-500/20 text-red-400"
                                : status === "REVIEW"
                                ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                : "bg-slate-500/5 border-slate-500/20 text-slate-400"
                            }`}>
                              {status === "ELIMINATED" ? "❌ Out" : status === "REVIEW" ? "⏳ Check" : "❓ Lead"}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Weapons Column */}
                    <div className="space-y-2 bg-black/25 p-3 rounded-2xl border border-white/[0.03]">
                      <div className="font-bold text-[#f59e0b] border-b border-white/5 pb-1.5 mb-2 uppercase text-[10px] tracking-wider flex justify-between items-center">
                        <span>Weapons</span>
                        <span className="text-[8px] text-gray-500">6 Cards</span>
                      </div>
                      
                      {WEAPONS.map((w) => {
                        const status = manualNotebook[w.id] || "POSSIBLE";
                        return (
                          <div
                            key={w.id}
                            onClick={() => toggleManualCard(w.id)}
                            className={`flex items-center justify-between p-2 rounded-lg border transition-all duration-200 cursor-pointer ${
                              status === "ELIMINATED"
                                ? "bg-red-950/5 border-red-900/10 opacity-40 text-gray-500 line-through"
                                : status === "REVIEW"
                                ? "bg-amber-950/10 border-amber-500/30 text-amber-300 font-semibold"
                                : "bg-white/[0.01] border-white/5 hover:border-white/10 text-gray-200 font-semibold"
                            }`}
                          >
                            <span className="truncate max-w-[120px]">{w.name}</span>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-bold border shrink-0 uppercase ${
                              status === "ELIMINATED"
                                ? "bg-red-500/10 border-red-500/20 text-red-400"
                                : status === "REVIEW"
                                ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                : "bg-slate-500/5 border-slate-500/20 text-slate-400"
                            }`}>
                              {status === "ELIMINATED" ? "❌ Out" : status === "REVIEW" ? "⏳ Check" : "❓ Lead"}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Rooms Column */}
                    <div className="space-y-2 bg-black/25 p-3 rounded-2xl border border-white/[0.03]">
                      <div className="font-bold text-[#06b6d4] border-b border-white/5 pb-1.5 mb-2 uppercase text-[10px] tracking-wider flex justify-between items-center">
                        <span>Rooms</span>
                        <span className="text-[8px] text-gray-500">9 Rooms</span>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-2 max-h-[260px] overflow-y-auto pr-1 scrollbar-thin">
                        {ROOMS.map((r) => {
                          const status = manualNotebook[r.id] || "POSSIBLE";
                          return (
                            <div
                              key={r.id}
                              onClick={() => toggleManualCard(r.id)}
                              className={`flex items-center justify-between p-2 rounded-lg border transition-all duration-200 cursor-pointer ${
                                status === "ELIMINATED"
                                  ? "bg-red-950/5 border-red-900/10 opacity-40 text-gray-500 line-through"
                                  : status === "REVIEW"
                                  ? "bg-amber-950/10 border-amber-500/30 text-amber-300 font-semibold"
                                  : "bg-white/[0.01] border-white/5 hover:border-white/10 text-gray-200 font-semibold"
                              }`}
                            >
                              <span className="truncate max-w-[120px]">{r.name.replace(/_/g, " ")}</span>
                              <span className={`px-2 py-0.5 rounded text-[8px] font-bold border shrink-0 uppercase ${
                                status === "ELIMINATED"
                                  ? "bg-red-500/10 border-red-500/20 text-red-400"
                                  : status === "REVIEW"
                                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                  : "bg-slate-500/5 border-slate-500/20 text-slate-400"
                              }`}>
                                {status === "ELIMINATED" ? "❌ Out" : status === "REVIEW" ? "⏳ Check" : "❓ Lead"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-black/25 p-3 rounded-2xl border border-white/[0.03]">
                    {(() => {
                      const humanDet = detectives.find((d) => d.id === humanDetectiveId);
                      if (!humanDet) return null;
                      
                      const storeNotebook = notebooks[humanDetectiveId];
                      if (!storeNotebook) return null;

                      // Merge manual checklist markings into the store notebook
                      const mergedNotebook = {
                        suspects: { ...storeNotebook.suspects },
                        weapons: { ...storeNotebook.weapons },
                        rooms: { ...storeNotebook.rooms },
                      };

                      // Overwrite with manual checklist markings if the card is not already known (held by me/other)
                      Object.keys(mergedNotebook.suspects).forEach((id) => {
                        const status = mergedNotebook.suspects[id as DetectiveId];
                        const manualStatus = manualNotebook[id];
                        if (status !== "HELD_BY_ME" && status !== "HELD_BY_OTHER") {
                          if (manualStatus === "ELIMINATED") {
                            mergedNotebook.suspects[id as DetectiveId] = "ELIMINATED";
                          }
                        }
                      });

                      Object.keys(mergedNotebook.weapons).forEach((id) => {
                        const status = mergedNotebook.weapons[id as WeaponId];
                        const manualStatus = manualNotebook[id];
                        if (status !== "HELD_BY_ME" && status !== "HELD_BY_OTHER") {
                          if (manualStatus === "ELIMINATED") {
                            mergedNotebook.weapons[id as WeaponId] = "ELIMINATED";
                          }
                        }
                      });

                      Object.keys(mergedNotebook.rooms).forEach((id) => {
                        const status = mergedNotebook.rooms[id as RoomId];
                        const manualStatus = manualNotebook[id];
                        if (status !== "HELD_BY_ME" && status !== "HELD_BY_OTHER") {
                          if (manualStatus === "ELIMINATED") {
                            mergedNotebook.rooms[id as RoomId] = "ELIMINATED";
                          }
                        }
                      });

                      return (
                        <ConspiracyWeb
                          detective={humanDet}
                          notebook={mergedNotebook}
                        />
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Winner Reveal Modal Overlay */}
      <AnimatePresence>
        {showWinnerReveal && winner && envelope && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-md w-full bg-[#0d1117] border border-[#b89255] rounded-2xl shadow-[0_0_50px_rgba(184,146,85,0.3)] overflow-hidden"
            >
              {/* Header */}
              <div className="bg-gradient-to-b from-[#b89255]/20 to-transparent p-6 text-center border-b border-white/5 relative">
                <Trophy className="w-16 h-16 mx-auto text-[#b89255] animate-bounce" />
                <h2 className="text-xl font-extrabold mt-4 text-[#b89255] serif-title uppercase tracking-widest">
                  Case Solved!
                </h2>
                <p className="text-xs text-[#94a3b8] font-mono mt-1">
                  Enigma concluded
                </p>
              </div>

              {/* Envelope details */}
              <div className="p-6 space-y-6">
                <div className="text-center bg-[#111827] border border-white/5 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-[#b89255] font-mono uppercase tracking-wider mb-3">
                    The Confidential Case File
                  </h3>
                  <div className="grid grid-cols-3 gap-2.5 text-center text-xs font-mono font-bold">
                    <div className="bg-[#080b14] border border-red-900/30 p-2.5 rounded text-[#f43f5e]">
                      <span className="block text-[8px] text-[#475569] font-medium uppercase mb-1">Suspect</span>
                      {getDetName(envelope.suspect)}
                    </div>
                    <div className="bg-[#080b14] border border-cyan-900/30 p-2.5 rounded text-[#06b6d4]">
                      <span className="block text-[8px] text-[#475569] font-medium uppercase mb-1">Weapon</span>
                      {envelope.weapon.replace(/_/g, " ")}
                    </div>
                    <div className="bg-[#080b14] border border-amber-900/30 p-2.5 rounded text-[#b89255]">
                      <span className="block text-[8px] text-[#475569] font-medium uppercase mb-1">Room</span>
                      {envelope.room.replace(/_/g, " ")}
                    </div>
                  </div>
                </div>

                {/* Winner stats */}
                <div className="flex items-center gap-4 bg-[#10b981]/5 border border-[#10b981]/10 rounded-xl p-4 text-xs font-mono">
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${DETECTIVE_BY_ID[winner]?.color}44 0%, ${DETECTIVE_BY_ID[winner]?.color}22 100%)`,
                      border: `1px solid ${DETECTIVE_BY_ID[winner]?.color}66`,
                      color: DETECTIVE_BY_ID[winner]?.color,
                    }}
                  >
                    {winner.charAt(0)}
                  </div>
                  <div>
                    <div className="text-[10px] text-[#475569] uppercase font-bold">Winner</div>
                    <h4 className="text-sm font-bold text-[#10b981]">
                      {getDetName(winner)}
                    </h4>
                    <p className="text-[10px] text-[#94a3b8] mt-0.5 leading-snug">
                      Solved the case with 100% confidence.
                    </p>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowWinnerReveal(false);
                      useGameStore.setState({ status: "initializing" });
                      setSetupStep("modes");
                    }}
                    className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-[#b89255] to-[#8a6a30] text-black font-semibold text-xs text-center border border-white/10 shadow-lg shadow-[#b89255]/20 active:scale-[0.98] transition-all"
                  >
                    Start New Match
                  </button>
                  <button
                    onClick={() => setShowWinnerReveal(false)}
                    className="px-4 py-2.5 rounded-lg bg-[#111827] border border-white/5 hover:border-white/10 text-xs font-mono font-semibold cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Accusation Modal Overlay */}
      <AnimatePresence>
        {showAccusationModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-md w-full bg-[#0d1117] border border-red-500/40 rounded-2xl shadow-[0_0_50px_rgba(239,68,68,0.25)] overflow-hidden"
            >
              {/* Header */}
              <div className="bg-gradient-to-b from-red-500/20 to-transparent p-6 text-center border-b border-white/5 relative">
                <AlertTriangle className="w-12 h-12 mx-auto text-red-500 animate-pulse" />
                <h2 className="text-xl font-extrabold mt-4 text-red-500 serif-title uppercase tracking-widest">
                  File Accusation
                </h2>
                <p className="text-xs text-red-400/80 font-mono mt-1">
                  Solve the Enigma Case
                </p>
              </div>

              {/* Warning box */}
              <div className="px-6 pt-6">
                <div className="bg-red-950/20 border border-red-500/20 rounded-xl p-3 text-red-300 font-mono text-[9px] leading-relaxed">
                  ⚠️ <strong>CRITICAL WARNING:</strong> If your accusation is incorrect, you will be immediately eliminated from the investigation. The other AI detectives will continue without you.
                </div>
              </div>

              {/* Inputs */}
              <div className="p-6 space-y-4 text-left">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-wider">Accuse Suspect</label>
                  <select
                    value={accusationSuspect}
                    onChange={(e) => setAccusationSuspect(e.target.value as DetectiveId)}
                    className="bg-[#0f172a] border border-white/10 rounded-lg p-2 text-xs font-semibold text-white focus:border-[#b89255] outline-none cursor-pointer"
                  >
                    {DETECTIVES.map((d) => (
                      <option key={d.id} value={d.id}>
                        {getDetName(d.id)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-wider">Accuse Weapon</label>
                  <select
                    value={accusationWeapon}
                    onChange={(e) => setAccusationWeapon(e.target.value as WeaponId)}
                    className="bg-[#0f172a] border border-white/10 rounded-lg p-2 text-xs font-semibold text-white focus:border-[#b89255] outline-none cursor-pointer"
                  >
                    {WEAPONS.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-wider">Accuse Room Location</label>
                  <div className="bg-[#0f172a]/60 border border-white/5 rounded-lg p-2.5 text-xs font-semibold text-gray-300 font-mono flex items-center justify-between">
                    <span>{activeDetective?.currentRoom ? activeDetective.currentRoom.replace(/_/g, " ") : "N/A"}</span>
                    <span className="text-[8px] bg-red-950/40 text-red-400 border border-red-900/30 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider font-mono">Locked to Current Room</span>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    disabled={isSyncing}
                    onClick={async () => {
                      setShowAccusationModal(false);
                      await makeAccusation({
                        suspect: accusationSuspect,
                        weapon: accusationWeapon,
                        room: accusationRoom,
                      });
                    }}
                    className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-red-600 to-red-800 text-white font-bold font-mono text-[10px] tracking-wider uppercase border border-red-500/40 shadow-lg hover:shadow-red-900/30 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                  >
                    Submit Accusation
                  </button>
                  <button
                    disabled={isSyncing}
                    onClick={() => setShowAccusationModal(false)}
                    className="px-4 py-2.5 rounded-lg bg-[#111827] border border-white/5 hover:border-white/10 text-[10px] font-mono font-semibold uppercase tracking-wider cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
