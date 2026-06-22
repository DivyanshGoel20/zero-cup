"use client";

import { motion } from "framer-motion";
import type { DetectiveId } from "@/lib/game/types";
import { DETECTIVES } from "@/lib/game/constants";

interface SuspicionMeterProps {
  confidence: Record<DetectiveId, number>;
  activeDetectiveId: DetectiveId;
  eliminatedIds: DetectiveId[];
}

export function SuspicionMeter({
  confidence,
  activeDetectiveId,
  eliminatedIds,
}: SuspicionMeterProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 border-b border-white/5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">
          Suspicion Meter
        </h3>
        <p className="text-[10px] text-[#475569] mt-0.5">Case-solving confidence per detective</p>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-4 px-4 py-4">
        {DETECTIVES.map((det) => {
          const pct = Math.round((confidence[det.id] ?? 0) * 100);
          const isActive = det.id === activeDetectiveId;
          const isElim = eliminatedIds.includes(det.id);

          return (
            <div key={det.id} className={`space-y-1.5 ${isElim ? "opacity-35" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: det.color, opacity: isElim ? 0.4 : 1 }}
                  />
                  <span
                    className="text-xs font-semibold truncate max-w-[120px]"
                    style={{ color: isActive ? det.color : "#f1f5f9" }}
                  >
                    {det.name}
                  </span>
                  {isActive && (
                    <span className="text-[9px] font-mono bg-white/5 px-1.5 py-0.5 rounded text-[#b89255]">
                      ▶ active
                    </span>
                  )}
                  {isElim && (
                    <span className="text-[9px] font-mono bg-red-900/20 px-1.5 py-0.5 rounded text-red-500">
                      OUT
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono" style={{ color: det.color }}>
                  {pct}%
                </span>
              </div>

              {/* Bar track */}
              <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: det.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
