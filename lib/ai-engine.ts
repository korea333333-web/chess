// Pure AI logic. No DOM, no React, no Web Worker. Safe to import from
// either the main thread or a Web Worker.

import { Chess, type Move, type PieceSymbol } from "chess.js";

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

const PST_PAWN: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const PST_KNIGHT: number[][] = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];

const PST_BISHOP: number[][] = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

const PST_ROOK: number[][] = [
  [0, 0, 0, 5, 5, 0, 0, 0],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const PST_QUEEN: number[][] = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
];

const PST_KING_MIDGAME: number[][] = [
  [20, 30, 10, 0, 0, 10, 30, 20],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
];

function pstValue(
  type: PieceSymbol,
  color: "w" | "b",
  boardRow: number,
  boardCol: number,
): number {
  const r = color === "w" ? 7 - boardRow : boardRow;
  switch (type) {
    case "p":
      return PST_PAWN[r][boardCol];
    case "n":
      return PST_KNIGHT[r][boardCol];
    case "b":
      return PST_BISHOP[r][boardCol];
    case "r":
      return PST_ROOK[r][boardCol];
    case "q":
      return PST_QUEEN[r][boardCol];
    case "k":
      return PST_KING_MIDGAME[r][boardCol];
  }
}

const MATE_SCORE = 100000;

export function evaluate(chess: Chess): number {
  if (chess.isCheckmate()) {
    return chess.turn() === "w" ? -MATE_SCORE : MATE_SCORE;
  }
  if (chess.isDraw() || chess.isStalemate()) return 0;

  let score = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const value =
        PIECE_VALUES[piece.type] + pstValue(piece.type, piece.color, r, c);
      score += piece.color === "w" ? value : -value;
    }
  }
  return score;
}

function moveOrderingScore(move: Move): number {
  let s = 0;
  if (move.captured) {
    s += PIECE_VALUES[move.captured] * 10 - PIECE_VALUES[move.piece];
  }
  if (move.promotion) {
    s += PIECE_VALUES[move.promotion];
  }
  return s;
}

function orderedMoves(chess: Chess): Move[] {
  const moves = chess.moves({ verbose: true }) as Move[];
  return moves.sort((a, b) => moveOrderingScore(b) - moveOrderingScore(a));
}

function minimax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
): number {
  if (depth === 0 || chess.isGameOver()) return evaluate(chess);

  const isWhiteToMove = chess.turn() === "w";
  const moves = orderedMoves(chess);

  if (isWhiteToMove) {
    let best = -Infinity;
    for (const m of moves) {
      chess.move(m);
      let score: number;
      try {
        score = minimax(chess, depth - 1, alpha, beta);
      } finally {
        chess.undo();
      }
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      chess.move(m);
      let score: number;
      try {
        score = minimax(chess, depth - 1, alpha, beta);
      } finally {
        chess.undo();
      }
      if (score < best) best = score;
      if (best < beta) beta = best;
      if (beta <= alpha) break;
    }
    return best;
  }
}

export function findBestMove(fen: string, depth: number): Move | null {
  const chess = new Chess(fen);
  const moves = orderedMoves(chess);
  if (moves.length === 0) return null;

  if (depth === 0) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const isWhiteToMove = chess.turn() === "w";
  let bestMove: Move | null = null;
  let bestScore = isWhiteToMove ? -Infinity : Infinity;
  let alpha = -Infinity;
  let beta = Infinity;

  for (const m of moves) {
    chess.move(m);
    let score: number;
    try {
      score = minimax(chess, depth - 1, alpha, beta);
    } finally {
      chess.undo();
    }
    if (isWhiteToMove) {
      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
      if (score > alpha) alpha = score;
    } else {
      if (score < bestScore) {
        bestScore = score;
        bestMove = m;
      }
      if (score < beta) beta = score;
    }
  }

  return bestMove ?? moves[0];
}

export type Difficulty = 0 | 1 | 2 | 3;

export const DIFFICULTY_LEVELS: ReadonlyArray<{
  id: Difficulty;
  label: string;
  description: string;
  searchDepth: number;
}> = [
  { id: 0, label: "입문", description: "무작위 수", searchDepth: 0 },
  { id: 1, label: "중급", description: "2수 앞 계산", searchDepth: 2 },
  { id: 2, label: "고급", description: "3수 앞 계산", searchDepth: 3 },
  { id: 3, label: "마스터", description: "4수 앞 계산", searchDepth: 4 },
];
