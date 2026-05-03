// Web Worker entry. Runs the chess AI search off the main thread so the
// UI (clicks, drags, premove) stays responsive even during deep searches.

import { findBestMove } from "./ai-engine";

type Request = { id: number; fen: string; depth: number };

self.addEventListener("message", (e: MessageEvent<Request>) => {
  const { id, fen, depth } = e.data;
  try {
    const move = findBestMove(fen, depth);
    self.postMessage({ id, move });
  } catch (err) {
    self.postMessage({ id, move: null, error: String(err) });
  }
});

export {};
