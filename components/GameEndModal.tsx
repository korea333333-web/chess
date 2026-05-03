"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";

export type GameResult = {
  outcome: "win" | "loss" | "draw";
  reason: string;
};

type Props = {
  open: boolean;
  result: GameResult | null;
  onPlayAgain: () => void;
  onExit: () => void;
};

export function GameEndModal({ open, result, onPlayAgain, onExit }: Props) {
  return (
    <AnimatePresence>
      {open && result && (
        <motion.div
          key="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-6"
          onClick={onExit}
        >
          <motion.div
            key="dialog"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-sm border border-foreground bg-background p-8 shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
          >
            <p className="text-xs uppercase tracking-widest text-muted">
              게임 종료
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              {result.outcome === "win"
                ? "승리"
                : result.outcome === "loss"
                  ? "패배"
                  : "무승부"}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">{result.reason}</p>

            <div className="mt-8 flex gap-3">
              <Button className="flex-1" onClick={onPlayAgain}>
                다시 두기
              </Button>
              <Button variant="secondary" className="flex-1" onClick={onExit}>
                나가기
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
