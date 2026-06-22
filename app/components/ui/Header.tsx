"use client";

import { useGameStore } from "@/lib/store/gameStore";
import { useUIStore, type GameSpeed } from "@/lib/store/uiStore";

export function Header() {
  const { status, gameId, round, turn, initGame } = useGameStore();
  const { gameSpeed, setGameSpeed } = useUIStore();

  const handleReset = () => {
    initGame();
  };

  return (
    <header className="border-b border-white/5 bg-[#0d1117]/80 backdrop-blur-md sticky top-0 z-50 py-4 px-6 md:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="wax-seal" />
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#b89255] font-sans">
            Ashford Manor Mystery
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-[#94a3b8] font-mono">
              Match ID: <span className="text-[#f1f5f9] font-medium">{gameId || "not_started"}</span>
            </span>
            <span className="h-1 w-1 rounded-full bg-[#475569]" />
            <span className="text-[10px] font-mono text-[#06b6d4]">0G Native Core</span>
          </div>
        </div>
      </div>

      {/* Turn Info & Status */}
      {status === "playing" && (
        <div className="flex items-center gap-4 bg-white/[0.02] border border-white/5 px-4 py-1.5 rounded-lg text-xs font-mono">
          <div>
            Round: <span className="text-[#b89255] font-bold">{round}</span>
          </div>
          <span className="h-3 w-[1px] bg-white/10" />
          <div>
            Turn: <span className="text-[#b89255] font-bold">{turn}</span>
          </div>
        </div>
      )}

      {/* Controls & Wallet Mock */}
      <div className="flex items-center flex-wrap gap-4">
        {/* Speed Selector */}
        <div className="flex items-center gap-1.5 bg-[#111827] border border-white/5 p-1 rounded-lg">
          {(["slow", "normal", "fast"] as GameSpeed[]).map((speed) => (
            <button
              key={speed}
              onClick={() => setGameSpeed(speed)}
              className={`px-2.5 py-1 text-[10px] uppercase font-mono font-semibold rounded transition-colors ${
                gameSpeed === speed
                  ? "bg-[#b89255] text-black"
                  : "text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-white/[0.03]"
              }`}
            >
              {speed}
            </button>
          ))}
        </div>

        {/* Action Button */}
        <button
          onClick={handleReset}
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold font-mono bg-white/[0.04] border border-white/5 hover:bg-white/[0.08] hover:border-white/10 active:scale-95 text-[#f1f5f9] transition-all"
        >
          {status === "initializing" ? "Start Game" : "New Match"}
        </button>

        {/* 0G network Connection */}
        <div className="flex items-center gap-2 bg-[#06b6d4]/5 border border-[#06b6d4]/15 px-3 py-1.5 rounded-lg text-[10px] font-mono text-[#06b6d4]">
          <span className="flex h-1.5 w-1.5 rounded-full bg-[#06b6d4]" />
          <span>0G Galileo Testnet</span>
        </div>
      </div>
    </header>
  );
}
