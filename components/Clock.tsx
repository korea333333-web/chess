"use client";

import { cn } from "@/lib/utils";

type Props = {
  ms: number;
  isActive: boolean;
  label?: string;
  className?: string;
};

function formatTime(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function Clock({ ms, isActive, label, className }: Props) {
  const isLow = ms <= 30000;
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-sm border px-3 py-2",
        "transition-colors duration-150",
        isActive
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-foreground",
        className,
      )}
    >
      {label && (
        <span
          className={cn(
            "text-xs uppercase tracking-widest",
            isActive ? "opacity-80" : "text-muted",
          )}
        >
          {label}
        </span>
      )}
      <span
        className={cn(
          "font-mono text-lg tabular-nums tracking-tight",
          isLow && !isActive && "text-error",
        )}
      >
        {formatTime(ms)}
      </span>
    </div>
  );
}
