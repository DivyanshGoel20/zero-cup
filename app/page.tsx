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
import { LedgerPanel } from "./components/spectator/LedgerPanel";
import { DETECTIVES, DETECTIVE_BY_ID } from "@/lib/game/constants";
import type { DetectiveId, WeaponId } from "@/lib/game/types";
import { runDeductionAnalysis } from "@/lib/game/deduction";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Trophy, Activity, Users, HelpCircle, AlertTriangle } from "lucide-react";

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
  } = useGameStore();

  const {
    gameSpeed,
    msPerStep,
    activePanel,
    isDiceAnimating,
    setDiceAnimating,
    setActivePanel,
    showWinnerReveal,
    setShowWinnerReveal,
  } = useUIStore();

  const [loadingKeys, setLoadingKeys] = useState(false);

  // 1. Automatically initialize game if initializing
  useEffect(() => {
    if (status === "initializing") {
      initGame();
    }
  }, [status, initGame]);

  // 2. Generate RSA Keypairs for all agents using Phase 1 crypto
  useEffect(() => {
    if (status === "playing" && detectives.length > 0 && detectives.some((d) => !d.publicKey) && !loadingKeys) {
      const initKeys = async () => {
        setLoadingKeys(true);
        const { generateKeyPair } = await import("@/lib/crypto/hybrid");
        const updated = await Promise.all(
          detectives.map(async (d) => {
            if (d.publicKey) return d;
            try {
              const keys = await generateKeyPair();
              return { ...d, publicKey: keys.publicKey };
            } catch (err) {
              console.error("Failed to generate keys for " + d.id, err);
              return { ...d, publicKey: "0g:mock_key_pair_" + d.id.toLowerCase() };
            }
          })
        );
        useGameStore.setState({ detectives: updated });
        setLoadingKeys(false);
      };
      initKeys();
    }
  }, [status, detectives, loadingKeys]);

  // 3. Automatic simulation loop
  useEffect(() => {
    if (status !== "playing") return;

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
      // Step C: Choose and process suggestion
      timer = setTimeout(() => {
        const activeId = detectiveOrder[currentDetectiveIndex];
        const detective = detectives.find((d) => d.id === activeId)!;
        const notebook = notebooks[activeId];

        if (detective.currentRoom && notebook) {
          // Find candidates that aren't ruled out in this agent's notebook
          const possibleSuspects = (Object.keys(notebook.suspects) as DetectiveId[]).filter(
            (id) => notebook.suspects[id] === "POSSIBLE"
          );
          const possibleWeapons = (Object.keys(notebook.weapons) as WeaponId[]).filter(
            (id) => notebook.weapons[id] === "POSSIBLE"
          );

          const suspect = possibleSuspects[Math.floor(Math.random() * possibleSuspects.length)] || "VANCE";
          const weapon = possibleWeapons[Math.floor(Math.random() * possibleWeapons.length)] || "PEARL_PISTOL";

          makeSuggestion({
            suspect,
            weapon,
            room: detective.currentRoom,
          });
        } else {
          // Fallback if not in a room
          makeSuggestion({
            suspect: "VANCE",
            weapon: "PEARL_PISTOL",
            room: "GRAND_FOYER",
          });
        }
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
  ]);

  // 4. Trigger modal reveal when game finishes
  useEffect(() => {
    if (status === "finished" && winner) {
      setShowWinnerReveal(true);
    }
  }, [status, winner, setShowWinnerReveal]);

  // Helper for current active detective
  const activeDetectiveId = detectiveOrder[currentDetectiveIndex];
  const activeDetective = detectives.find((d) => d.id === activeDetectiveId);

  // Status message text
  const getStatusMessage = () => {
    if (status === "finished") {
      return winner
        ? `${DETECTIVE_BY_ID[winner]?.name} solved the murder!`
        : "All detectives eliminated. Ashford Manor remains a mystery.";
    }
    if (!activeDetective) return "Initializing board...";

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

  return (
    <div className="flex flex-col min-h-screen bg-[#080b14] text-[#f1f5f9] font-sans selection:bg-[#b89255] selection:text-black">
      {/* Header bar */}
      <Header />

      {/* Main content grid */}
      <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
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
                  speed={gameSpeed}
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
              {(["feed", "suspicion", "detectives", "ledger"] as const).map((tab) => {
                const getTabDetails = (t: typeof tab) => {
                  switch (t) {
                    case "feed":
                      return { label: "Events", icon: Activity };
                    case "suspicion":
                      return { label: "Confidence", icon: HelpCircle };
                    case "detectives":
                      return { label: "Dossiers", icon: Users };
                    case "ledger":
                      return { label: "0G Ledger", icon: Shield };
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
              {activePanel === "ledger" && <LedgerPanel log={log} />}
            </div>
          </div>
        </section>
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
                      Solved the case with 100% confidence. Ledger records uploaded to 0G.
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
