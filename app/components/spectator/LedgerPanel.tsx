"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { LogEntry } from "@/lib/game/types";
import { useRef, useEffect } from "react";

interface LedgerPanelProps {
  log: LogEntry[];
}

export function LedgerPanel({ log }: LedgerPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Filter logs that have either txHash or rootHash (meaning they involve 0G Operations)
  const ledgerEntries = log.filter((entry) => entry.txHash || entry.rootHash);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ledgerEntries.length]);

  return (
    <div className="flex flex-col h-full font-mono text-[11px]">
      {/* Title Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-white/5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#06b6d4]">
          0G Ledger Console
        </h3>
        <span className="text-[10px] text-[#475569]">{ledgerEntries.length} operations</span>
      </div>

      {/* Terminal logs list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-black/20">
        {ledgerEntries.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-[#475569] italic py-10">
            Awaiting 0G network operations...
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {ledgerEntries.map((entry) => {
              const timeStr = new Date(entry.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });

              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border-b border-white/[0.03] pb-2.5 last:border-0"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[#475569]">{timeStr}</span>
                      {entry.txHash ? (
                        <span className="bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20 px-1 py-0.2 rounded text-[9px] font-bold">
                          CHAIN_TX
                        </span>
                      ) : (
                        <span className="bg-[#06b6d4]/10 text-[#06b6d4] border border-[#06b6d4]/20 px-1 py-0.2 rounded text-[9px] font-bold">
                          STORAGE_UPLOAD
                        </span>
                      )}
                    </div>
                    <span className="text-emerald-500 font-bold flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                      CONFIRMED
                    </span>
                  </div>

                  <p className="text-[#f1f5f9] leading-relaxed break-words">
                    {entry.details}
                  </p>

                  {entry.txHash && (
                    <div className="mt-1 flex items-center gap-1 text-[9px] text-[#94a3b8] bg-[#111827] px-2 py-1 rounded border border-white/[0.04]">
                      <span className="text-[#b89255] shrink-0">TX:</span>
                      <span className="truncate max-w-[280px]" title={entry.txHash}>
                        {entry.txHash}
                      </span>
                    </div>
                  )}

                  {entry.rootHash && (
                    <div className="mt-1 flex items-center gap-1 text-[9px] text-[#94a3b8] bg-[#111827] px-2 py-1 rounded border border-white/[0.04]">
                      <span className="text-[#06b6d4] shrink-0">ROOT:</span>
                      <span className="truncate max-w-[280px]" title={entry.rootHash}>
                        {entry.rootHash}
                      </span>
                    </div>
                  )}

                  {entry.isEncrypted && (
                    <div className="mt-1 flex items-center gap-1 text-[9px] text-[#a78bfa] italic">
                      <span>🔑 Encrypted (RSA-OAEP 2048 envelope + AES-GCM 256)</span>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
