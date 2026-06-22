"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/store/gameStore";
import { useUIStore, type ActivePanel } from "@/lib/store/uiStore";
import { Header } from "./components/ui/Header";
import { GameBoard } from "./components/board/GameBoard";
import { DiceDisplay } from "./components/ui/DiceDisplay";
import { ActivityFeed } from "./components/spectator/ActivityFeed";
import { SuspicionMeter } from "./components/spectator/SuspicionMeter";
import { DetectiveCard } from "./components/spectator/DetectiveCard";
import { DETECTIVES, DETECTIVE_BY_ID } from "@/lib/game/constants";
import type { DetectiveId, WeaponId } from "@/lib/game/types";
import { runDeductionAnalysis } from "@/lib/game/deduction";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Activity, Users, HelpCircle, AlertTriangle } from "lucide-react";

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
  } = useGameStore();

  const {
    msPerStep,
    activePanel,
    isDiceAnimating,
    setDiceAnimating,
    setActivePanel,
    showWinnerReveal,
    setShowWinnerReveal,
  } = useUIStore();

  // Helper for current active detective
  const activeDetectiveId = detectiveOrder[currentDetectiveIndex];
  const activeDetective = detectives.find((d) => d.id === activeDetectiveId);

  // Note: key pairs are generated inside the store's initGame action

  // 3. Automatic simulation loop
  useEffect(() => {
    if (status !== "playing") return;
    if (isSyncing || error) return; // Halt loop on syncing or integration error

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
  ]);

  // 4. Trigger monologue fetch when state transitions to idle (roll) or suggesting (investigate)
  useEffect(() => {
    if (status !== "playing" || !activeDetective) return;
    if (isSyncing || error) return; // Halt loop on syncing or integration error

    const activeId = activeDetective.id;
    const roundVal = useGameStore.getState().round;
    const turnVal = useGameStore.getState().turn;

    if (actionState === "idle") {
      const context = `Location: Hallway (${activeDetective.position.x}, ${activeDetective.position.y}), Round: ${roundVal}, Turn: ${turnVal}`;
      fetchAIMonologue(activeId, context, "ROLL_DICE");
    } else if (actionState === "suggesting" && activeDetective.currentRoom) {
      const context = `Location: ${activeDetective.currentRoom}, Notebook solved progress: ${Math.round((confidence[activeId] || 0) * 100)}%`;
      fetchAIMonologue(activeId, context, "MAKE_SUGGESTION");
    }
  }, [status, actionState, activeDetectiveId, isSyncing, error]);

  // 5. Trigger modal reveal when game finishes
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
        : "All detectives eliminated. Ashford Manor remains a mystery.";
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
            <div className="space-y-3">
              <div className="wax-seal mx-auto w-16 h-16 shadow-[0_0_20px_rgba(139,17,17,0.4)]" />
              <h2 className="text-3xl font-extrabold tracking-tight text-[#b89255]">
                Ashford Manor Mystery
              </h2>
              <p className="text-sm text-[#94a3b8] font-mono max-w-lg mx-auto">
                A decentralized board game where five AI detective agents race to solve a murder, anchoring logs to 0G Storage & Chain.
              </p>
            </div>

            {/* Detectives list */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 pt-4 border-t border-b border-white/5 py-6">
              {DETECTIVES.map((det) => (
                <div key={det.id} className="bg-white/[0.02] border border-white/5 p-3.5 rounded-xl hover:border-white/10 transition-colors">
                  <div
                    className="w-8 h-8 rounded-full mx-auto flex items-center justify-center font-bold text-sm shadow-inner"
                    style={{
                      backgroundColor: `${det.color}22`,
                      color: det.color,
                      border: `1px solid ${det.color}44`
                    }}
                  >
                    {det.name.charAt(0)}
                  </div>
                  <h4 className="text-xs font-bold mt-2 truncate" style={{ color: det.color }}>
                    {det.name}
                  </h4>
                  <span className="text-[9px] text-[#475569] block font-mono mt-0.5 truncate uppercase">
                    {det.id}
                  </span>
                </div>
              ))}
            </div>

            {/* Begin Case Button */}
            <div className="pt-2">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => initGame()}
                className="px-8 py-3.5 rounded-xl font-bold font-mono text-sm tracking-wider uppercase bg-gradient-to-r from-[#b89255] to-[#8a6a30] text-black shadow-lg shadow-[#b89255]/20 hover:shadow-[#b89255]/35 transition-all cursor-pointer active:scale-95"
              >
                Begin Investigation
              </motion.button>
              <p className="text-[10px] text-[#475569] font-mono mt-3">
                *The game will play automatically for up to 2 rounds once started.
              </p>
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
      <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full flex flex-col gap-6">
        
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start w-full">
        
        {/* Left Column: Board (Span 2) */}
        <section className="lg:col-span-2 flex flex-col gap-6">
          <div className="glass-panel p-4 md:p-6 shadow-2xl flex flex-col items-center">
            {/* Active turn header */}
            <div className="w-full flex items-center justify-between border-b border-white/5 pb-3 mb-4 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-[#b89255] animate-pulse" />
                <span className="text-[#94a3b8]">Rival Investigation Status</span>
              </div>
              {activeDetective && (
                <span style={{ color: activeDetective.color }} className="font-bold">
                  {activeDetective.name}&apos;s Move
                </span>
              )}
            </div>

            {/* Board renderer */}
            <div className="w-full max-w-[500px]">
              <GameBoard
                detectives={detectives}
                activeDetectiveId={activeDetectiveId}
                highlightedCells={actionState === "moving" ? movementPath : []}
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
                  disabled={actionState !== "idle" || status !== "playing"}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Spectator Panels (Span 1) */}
        <section className="lg:col-span-1 h-full flex flex-col gap-6">
          <div className="glass-panel shadow-xl flex-1 flex flex-col min-h-[580px] max-h-[700px]">
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
                <h2 className="text-xl font-bold mt-4 text-[#b89255] uppercase tracking-wide">
                  Case Solved!
                </h2>
                <p className="text-xs text-[#94a3b8] font-mono mt-1">
                  Ashford Manor Mystery concluded
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
                    className="px-4 py-2.5 rounded-lg bg-[#111827] border border-white/5 hover:border-white/10 text-xs font-mono font-semibold"
                  >
                    Close
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
