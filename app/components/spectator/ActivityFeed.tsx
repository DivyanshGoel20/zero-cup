"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { LogEntry } from "@/lib/game/types";
import { DETECTIVE_BY_ID } from "@/lib/game/constants";
import { useEffect, useRef } from "react";

const ACTION_STYLES: Record<string, { label: string; color: string }> = {
  GAME_START:     { label: "START",    color: "#10b981" },
  ROLL:           { label: "ROLL",     color: "#b89255" },
  ENTER_ROOM:     { label: "ENTER",    color: "#06b6d4" },
  SUGGEST:        { label: "SUGGEST",  color: "#8b5cf6" },
  DISPROVE:       { label: "DISPROVE", color: "#f59e0b" },
  NO_DISPROVAL:   { label: "OPEN!",    color: "#f43f5e" },
  ACCUSE:         { label: "ACCUSE",   color: "#ef4444" },
  ELIMINATED:     { label: "OUT",      color: "#475569" },
  TURN_START:     { label: "TURN",     color: "#64748b" },
  GAME_OVER:      { label: "OVER",     color: "#10b981" },
  THINK:          { label: "THINK",    color: "#a78bfa" },
  STORAGE_UPLOAD: { label: "STORAGE",  color: "#06b6d4" },
  CHAIN_CONFIRM:  { label: "CHAIN",    color: "#10b981" },
};

interface ActivityFeedProps {
  log: LogEntry[];
}

export function ActivityFeed({ log }: ActivityFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-white/5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">
          Activity Feed
        </h3>
        <span className="text-[10px] font-mono text-[#475569]">{log.length} events</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        <AnimatePresence initial={false}>
          {log.map((entry) => {
            const style = ACTION_STYLES[entry.action] ?? { label: entry.action, color: "#64748b" };
            const det = entry.agentId !== "SYSTEM" ? DETECTIVE_BY_ID[entry.agentId] : null;

            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.22 }}
                className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.025] border border-white/[0.04]"
              >
                {/* Badge */}
                <span
                  className="shrink-0 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded mt-0.5"
                  style={{
                    background: `${style.color}22`,
                    color: style.color,
                    border: `1px solid ${style.color}44`,
                  }}
                >
                  {style.label}
                </span>

                <div className="flex-1 min-w-0">
                  {det && (
                    <div className="flex items-center gap-1 mb-0.5">
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: det.color }}
                      />
                      <span className="text-[10px] font-semibold text-[#f1f5f9] truncate">
                        {det.name}
                      </span>
                    </div>
                  )}
                  <p className="text-[10px] text-[#94a3b8] leading-snug">{entry.details}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
