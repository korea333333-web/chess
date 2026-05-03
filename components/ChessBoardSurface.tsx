"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Wraps a Chessboard. Two responsibilities:
 *
 * 1. Stop contextmenu in capture phase so react-chessboard's inline
 *    e.preventDefault() never runs. The browser's default right-click menu
 *    (Back, Forward, Reload, …) is allowed to appear.
 *
 * 2. Stop mousedown / mouseup / pointerdown / pointerup with button === 2
 *    in capture phase so react-chessboard never starts an arrow-drawing
 *    drag. Setting allowDrawingArrows: false on the library should be
 *    sufficient, but blocking the events at this layer is defense-in-depth
 *    and unaffected by future library changes.
 *
 * Left-click (button 0) is left untouched so click-to-move and drag-to-move
 * keep working.
 */
export function ChessBoardSurface({ children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const stopRightClick = (e: MouseEvent | PointerEvent) => {
      if (e.button === 2) {
        e.stopImmediatePropagation();
      }
    };
    const stopContext = (e: Event) => {
      e.stopImmediatePropagation();
    };

    el.addEventListener("contextmenu", stopContext, true);
    el.addEventListener("mousedown", stopRightClick as EventListener, true);
    el.addEventListener("mouseup", stopRightClick as EventListener, true);
    el.addEventListener("pointerdown", stopRightClick as EventListener, true);
    el.addEventListener("pointerup", stopRightClick as EventListener, true);

    return () => {
      el.removeEventListener("contextmenu", stopContext, true);
      el.removeEventListener("mousedown", stopRightClick as EventListener, true);
      el.removeEventListener("mouseup", stopRightClick as EventListener, true);
      el.removeEventListener(
        "pointerdown",
        stopRightClick as EventListener,
        true,
      );
      el.removeEventListener(
        "pointerup",
        stopRightClick as EventListener,
        true,
      );
    };
  }, []);

  return (
    <div ref={ref} className={cn(className)}>
      {children}
    </div>
  );
}
