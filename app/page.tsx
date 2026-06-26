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
import { DETECTIVES, DETECTIVE_BY_ID, WEAPONS, ROOMS } from "@/lib/game/constants";
import type { DetectiveId, WeaponId, RoomId, Position, Card } from "@/lib/game/types";
import { runDeductionAnalysis } from "@/lib/game/deduction";
import { getReachableCells } from "@/lib/game/board";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Activity, Users, HelpCircle, AlertTriangle } from "lucide-react";

const getCardDetails = (id: string) => {
  const cleanId = id.toUpperCase();
  if (
    cleanId.includes("VANCE") ||
    cleanId.includes("ROSEWOOD") ||
    cleanId.includes("BLACKWOOD") ||
    cleanId.includes("STERLING") ||
    cleanId.includes("ASHCROFT")
  ) {
    return { type: "SUSPECT", icon: "👤", color: "text-[#a78bfa] border-[#a78bfa]/20" };
  }
  if (
    cleanId.includes("PISTOL") ||
    cleanId.includes("OPENER") ||
    cleanId.includes("STRYCHNINE") ||
    cleanId.includes("CLOCK") ||
    cleanId.includes("TIE") ||
    cleanId.includes("CANE")
  ) {
    return { type: "WEAPON", icon: "🗡️", color: "text-[#f59e0b] border-[#f59e0b]/20" };
  }
  return { type: "ROOM", icon: "🚪", color: "text-[#06b6d4] border-[#06b6d4]/20" };
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
    envelope,
    initGame,
    rollDiceAction,
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
  const [suggestionSuspect, setSuggestionSuspect] = useState<DetectiveId>("VANCE");
  const [suggestionWeapon, setSuggestionWeapon] = useState<WeaponId>("PEARL_PISTOL");
  const [showAccusationModal, setShowAccusationModal] = useState(false);
  const [accusationSuspect, setAccusationSuspect] = useState<DetectiveId>("VANCE");
  const [accusationWeapon, setAccusationWeapon] = useState<WeaponId>("PEARL_PISTOL");
  const [accusationRoom, setAccusationRoom] = useState<RoomId>("GRAND_FOYER");

  // Helper for current active detective
  const activeDetectiveId = detectiveOrder[currentDetectiveIndex];
  const activeDetective = detectives.find((d) => d.id === activeDetectiveId);

  const isHumanTurn = activeDetectiveId === humanDetectiveId;
  const isHumanMoving = isHumanTurn && actionState === "moving" && movementPath.length === 0;

  const reachableCells = useMemo(() => {
    if (isHumanMoving && activeDetective && diceRoll !== null) {
      return getReachableCells(activeDetective.position, diceRoll);
    }
    return [];
  }, [isHumanMoving, activeDetective, diceRoll]);

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
      // Step A: Wait briefly, then animate & roll dice
      timer = setTimeout(() => {
        setDiceAnimating(true);
        // Wait 700ms for dice animation, then complete roll
        timer = setTimeout(() => {
          setDiceAnimating(false);
          rollDiceAction();
        }, 700);
      }, msPerStep * 2.5);
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
          const solution = runDeductionAnalysis(notebook);
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
        ? `${DETECTIVE_BY_ID[winner]?.name} solved the murder!`
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
      <div className="flex flex-col min-h-screen bg-[#080b14] text-[#f1f5f9] font-sans selection:bg-[#b89255] selection:text-black">
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

            {/* Choose Role Section */}
            <div className="space-y-4 pt-4 border-t border-white/5 text-center">
              <h3 className="text-xs font-mono font-bold text-[#b89255] uppercase tracking-wider">
                Select Your Role
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
                {/* Spectator card */}
                <div
                  onClick={() => setSelectedRole("spectator")}
                  className={`cursor-pointer glass-panel p-3 rounded-xl border transition-all duration-300 text-left flex flex-col justify-between h-28 relative ${
                    selectedRole === "spectator"
                      ? "border-[#b89255] bg-[#b89255]/5 shadow-[0_0_15px_rgba(184,146,85,0.2)]"
                      : "border-white/5 hover:border-white/10 bg-white/[0.01]"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-[11px] font-mono font-bold text-white uppercase tracking-wide">
                      Spectator
                    </span>
                    {selectedRole === "spectator" && (
                      <span className="text-[8px] bg-[#b89255]/20 text-[#b89255] px-1 py-0.5 rounded font-mono uppercase font-bold border border-[#b89255]/30">
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="text-[9px] text-[#94a3b8] leading-relaxed">
                    Watch all 5 AI detectives solve the murder case automatically.
                  </p>
                </div>

                {/* Detective cards */}
                {DETECTIVES.map((det) => (
                  <div
                    key={det.id}
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
                          {det.name}
                        </span>
                      </div>
                      {selectedRole === det.id && (
                        <span className="text-[8px] bg-[#b89255]/20 text-[#b89255] px-1 py-0.5 rounded font-mono uppercase font-bold border border-[#b89255]/30">
                          Player
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] text-[#94a3b8] leading-relaxed line-clamp-2">
                      {det.personality}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Begin Case Button / Loading Progress Bar */}
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
              ) : (
                <>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => initGame(selectedRole === "spectator" ? null : selectedRole)}
                    className="px-8 py-4 rounded-xl font-bold font-mono text-xs tracking-widest uppercase bg-gradient-to-r from-[#b89255] to-[#8a6a30] text-[#0f0a05] border border-[#d4aa6a]/40 shadow-xl shadow-black/50 hover:shadow-[#b89255]/25 transition-all cursor-pointer active:scale-95"
                  >
                    Begin Investigation
                  </motion.button>
                  <p className="text-[10px] text-[#64748b] font-mono mt-3">
                    {selectedRole === "spectator"
                      ? "*The game will play automatically until the case is solved or all detectives are eliminated."
                      : "*You will control your detective and make moves, suggest clues, and disprove cards yourself."}
                  </p>
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#080b14] text-[#f1f5f9] font-sans selection:bg-[#b89255] selection:text-black">
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
                  if (isHumanMoving) {
                    moveHumanAction(pos);
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
              <div className="shrink-0">
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
                      <strong>{DETECTIVE_BY_ID[disprovalPending.suggesterId]?.name}</strong> suggested that the murder was committed by{" "}
                      <strong>{DETECTIVE_BY_ID[disprovalPending.suggestion.suspect]?.name}</strong> with the{" "}
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
                            className="bg-[#0f172a] hover:bg-[#1e293b] border border-white/5 hover:border-[#b89255] rounded-xl p-3 text-left w-28 h-36 flex flex-col justify-between cursor-pointer transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                          >
                            <div className="flex justify-between items-center w-full">
                              <span className="text-[7px] font-mono text-gray-400 font-bold uppercase">{details.type}</span>
                              <span className="text-[10px]">{details.icon}</span>
                            </div>
                            <div className="text-[16px] text-center w-full my-1">
                              {details.icon === "👤" ? "🕵️" : details.icon === "🗡️" ? "⚔️" : "🏛️"}
                            </div>
                            <div className="text-[8px] font-mono font-black text-white uppercase text-center tracking-wider leading-tight line-clamp-2 pt-1 border-t border-white/5">
                              {card.name.replace(/_/g, " ")}
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
                        onClick={() => {
                          setAccusationRoom(activeDetective?.currentRoom || "GRAND_FOYER");
                          setShowAccusationModal(true);
                        }}
                        className="px-3 py-1 bg-red-950/45 hover:bg-red-900/45 text-red-400 border border-red-900/40 rounded-lg text-[9px] font-bold font-mono tracking-wider uppercase transition-all hover:border-red-500/50 cursor-pointer active:scale-95"
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
                                  {d.name}
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
          <div className="glass-panel shadow-xl flex flex-col h-[700px] xl:h-[780px] overflow-hidden">
            {/* Panel Tabs Header */}
            <div className="flex border-b border-white/5 bg-black/10 rounded-t-2xl">
              {(["feed", "suspicion", "detectives"] as const).map((tab) => {
                const getTabDetails = (t: typeof tab) => {
                  switch (t) {
                    case "feed":
                      return { label: "Events", icon: Activity };
                    case "suspicion":
                      return { label: "Confidence", icon: HelpCircle };
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
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
        </div>
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
                      {DETECTIVE_BY_ID[envelope.suspect]?.name || envelope.suspect}
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
                      {DETECTIVE_BY_ID[winner]?.name}
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
                      initGame();
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
                        {d.name}
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
                  <select
                    value={accusationRoom}
                    onChange={(e) => setAccusationRoom(e.target.value as RoomId)}
                    className="bg-[#0f172a] border border-white/10 rounded-lg p-2 text-xs font-semibold text-white focus:border-[#b89255] outline-none cursor-pointer"
                  >
                    {ROOMS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
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
