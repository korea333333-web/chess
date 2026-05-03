// Client-side AI API. Runs the chess search inside a Web Worker so that
// inner minimax computation does not block the main thread (keeping clicks,
// drags, and the premove highlight responsive on every difficulty).

import type { Move } from "chess.js";
import {
  findBestMove,
  DIFFICULTY_LEVELS,
  type Difficulty,
} from "./ai-engine";

export {
  findBestMove,
  DIFFICULTY_LEVELS,
  type Difficulty,
} from "./ai-engine";

// Minimum thinking time so the player has time to set a premove
// even when the AI's actual computation is near-instant (e.g., depth 0).
// Long enough that the red premove highlight is clearly visible after the
// player queues a move, before the AI's response collapses the highlight.
const MIN_THINK_MS = 2000;

type WorkerResponse = { id: number; move: Move | null; error?: string };

let worker: Worker | null | undefined; // undefined = not yet attempted
const handlers = new Map<number, (move: Move | null) => void>();
let nextRequestId = 1;

function getWorker(): Worker | null {
  if (typeof window === "undefined") return null;
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./ai-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (e: MessageEvent<WorkerResponse>) => {
      const { id, move } = e.data;
      const handler = handlers.get(id);
      if (handler) {
        handler(move);
        handlers.delete(id);
      }
    });
    worker.addEventListener("error", (err) => {
      // If the worker crashes, reject all pending requests so callers don't
      // hang forever.
      // eslint-disable-next-line no-console
      console.error("AI worker error:", err);
      for (const handler of handlers.values()) handler(null);
      handlers.clear();
    });
  } catch {
    worker = null;
  }
  return worker;
}

function computeViaWorker(
  fen: string,
  depth: number,
): Promise<Move | null> | null {
  const w = getWorker();
  if (!w) return null;
  return new Promise<Move | null>((resolve) => {
    const id = nextRequestId++;
    handlers.set(id, resolve);
    w.postMessage({ id, fen, depth });
  });
}

export async function findBestMoveAsync(
  fen: string,
  difficulty: Difficulty,
): Promise<Move | null> {
  const depth = DIFFICULTY_LEVELS[difficulty].searchDepth;
  const start = performance.now();

  // Yield once so the "thinking" indicator and any pending UI updates
  // commit before search begins.
  await new Promise<void>((r) => setTimeout(r, 0));

  let move: Move | null;
  const workerPromise = computeViaWorker(fen, depth);
  if (workerPromise) {
    move = await workerPromise;
  } else {
    // Fallback (e.g. SSR or worker disabled). Runs synchronously on the main
    // thread; UI freeze is unavoidable but at least the game still works.
    try {
      move = findBestMove(fen, depth);
    } catch {
      move = null;
    }
  }

  const elapsed = performance.now() - start;
  const remaining = MIN_THINK_MS - elapsed;
  if (remaining > 0) {
    await new Promise<void>((r) => setTimeout(r, remaining));
  }
  return move;
}
