"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Chess, type Move } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Button } from "@/components/ui/Button";
import { useRequireAuth } from "@/hooks/useAuth";
import { SoundToggle } from "@/components/SoundToggle";
import { ChessBoardSurface } from "@/components/ChessBoardSurface";
import { sounds } from "@/lib/sound";

type GameStatus =
  | { kind: "playing"; turn: "w" | "b"; check: boolean }
  | { kind: "checkmate"; winner: "w" | "b" }
  | { kind: "stalemate" }
  | { kind: "draw"; reason: "fifty-move" | "other" };

function computeStatus(chess: Chess): GameStatus {
  if (chess.isCheckmate()) {
    return { kind: "checkmate", winner: chess.turn() === "w" ? "b" : "w" };
  }
  if (chess.isStalemate()) return { kind: "stalemate" };
  if (chess.isDraw()) {
    return {
      kind: "draw",
      reason: chess.isDrawByFiftyMoves() ? "fifty-move" : "other",
    };
  }
  return { kind: "playing", turn: chess.turn(), check: chess.isCheck() };
}

function statusText(status: GameStatus): string {
  switch (status.kind) {
    case "playing":
      return status.check
        ? `${status.turn === "w" ? "백" : "흑"} 차례 — 체크!`
        : `${status.turn === "w" ? "백" : "흑"} 차례`;
    case "checkmate":
      return `체크메이트 — ${status.winner === "w" ? "백" : "흑"} 승리`;
    case "stalemate":
      return "스테일메이트 — 무승부";
    case "draw":
      return status.reason === "fifty-move"
        ? "무승부 — 50수 규칙"
        : "무승부";
  }
}

function playMoveSound(move: Move, chess: Chess): void {
  if (chess.isCheckmate()) {
    sounds.checkmate();
    return;
  }
  if (chess.isCheck()) {
    sounds.check();
    return;
  }
  if (move.flags.includes("c") || move.flags.includes("e")) {
    sounds.capture();
    return;
  }
  sounds.move();
}

export default function LocalPlayPage() {
  const { user, isLoading } = useRequireAuth();
  const chessRef = useRef<Chess | null>(null);
  if (chessRef.current === null) chessRef.current = new Chess();
  const chess = chessRef.current;

  const [position, setPosition] = useState(chess.fen());
  const [moveCount, setMoveCount] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);

  const status = useMemo(() => computeStatus(chess), [chess, position]);
  const isGameOver = status.kind !== "playing";

  const tryMove = useCallback(
    (from: string, to: string): boolean => {
      try {
        const move = chess.move({ from, to, promotion: "q" });
        if (!move) return false;
        playMoveSound(move, chess);
        setPosition(chess.fen());
        setMoveCount((c) => c + 1);
        setSelectedSquare(null);
        setLegalMoves([]);
        return true;
      } catch {
        return false;
      }
    },
    [chess],
  );

  const handlePieceDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }): boolean => {
      if (!targetSquare) return false;
      if (isGameOver) return false;
      return tryMove(sourceSquare, targetSquare);
    },
    [isGameOver, tryMove],
  );

  const selectSquare = useCallback(
    (square: string) => {
      if (isGameOver) return;
      const piece = chess.get(square as Parameters<Chess["get"]>[0]);
      if (!piece || piece.color !== chess.turn()) {
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }
      const moves = chess.moves({
        square: square as Parameters<Chess["moves"]>[0]["square"],
        verbose: true,
      }) as Move[];
      setSelectedSquare(square);
      setLegalMoves(moves);
    },
    [chess, isGameOver],
  );

  const handleSquareClick = useCallback(
    ({ square }: { square: string }) => {
      if (isGameOver) return;
      if (selectedSquare && selectedSquare === square) {
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }
      if (selectedSquare && legalMoves.some((m) => m.to === square)) {
        tryMove(selectedSquare, square);
        return;
      }
      selectSquare(square);
    },
    [isGameOver, selectedSquare, legalMoves, selectSquare, tryMove],
  );

  const handleNewGame = useCallback(() => {
    chess.reset();
    setPosition(chess.fen());
    setMoveCount(0);
    setSelectedSquare(null);
    setLegalMoves([]);
    sounds.start();
  }, [chess]);

  const squareStyles = useMemo<Record<string, React.CSSProperties>>(() => {
    const styles: Record<string, React.CSSProperties> = {};

    const lastMove = chess.history({ verbose: true }).at(-1);
    if (lastMove) {
      const last: React.CSSProperties = {
        boxShadow: "inset 0 0 0 100px rgba(0,0,0,0.10)",
      };
      styles[lastMove.from] = { ...last };
      styles[lastMove.to] = { ...last };
    }

    if (selectedSquare) {
      styles[selectedSquare] = {
        ...(styles[selectedSquare] ?? {}),
        boxShadow: "inset 0 0 0 100px rgba(0,0,0,0.20)",
      };
    }

    for (const m of legalMoves) {
      const isCapture = m.flags.includes("c") || m.flags.includes("e");
      if (isCapture) {
        styles[m.to] = {
          ...(styles[m.to] ?? {}),
          boxShadow: "inset 0 0 0 4px rgba(0,0,0,0.40)",
        };
      } else {
        styles[m.to] = {
          ...(styles[m.to] ?? {}),
          backgroundImage:
            "radial-gradient(circle, rgba(0,0,0,0.30) 22%, transparent 23%)",
        };
      }
    }

    return styles;
  }, [chess, position, selectedSquare, legalMoves]);

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">불러오는 중...</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← 메인
          </Link>
          <span className="text-xs uppercase tracking-widest text-muted">
            로컬 연습
          </span>
          <SoundToggle />
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-6 py-8"
      >
        <div className="mb-6 text-center">
          <p
            key={position}
            className="font-mono text-sm tracking-tight text-foreground"
          >
            {statusText(status)}
          </p>
          <p className="mt-1 text-xs text-muted">
            수 {moveCount} · {chess.moveNumber()}수
          </p>
        </div>

        <ChessBoardSurface className="w-full max-w-[560px] aspect-square">
          <Chessboard
            options={{
              position,
              onSquareClick: handleSquareClick,
              onPieceDrop: handlePieceDrop,
              squareStyles,
              animationDurationInMs: 200,
              showAnimations: true,
              allowDragging: !isGameOver,
              allowDrawingArrows: false,
              arrows: [],
              boardStyle: {
                width: "100%",
                height: "100%",
                border: "1px solid var(--foreground)",
              },
              lightSquareStyle: { backgroundColor: "var(--board-light)" },
              darkSquareStyle: { backgroundColor: "var(--board-dark)" },
              darkSquareNotationStyle: {
                color: "var(--board-light)",
                fontSize: "0.7rem",
                fontFamily: "var(--font-mono)",
              },
              lightSquareNotationStyle: {
                color: "var(--board-dark)",
                fontSize: "0.7rem",
                fontFamily: "var(--font-mono)",
              },
            }}
          />
        </ChessBoardSurface>

        <div className="mt-8 flex gap-3">
          <Button variant="secondary" onClick={handleNewGame}>
            새 게임
          </Button>
          <Link href="/">
            <Button variant="ghost">메인으로</Button>
          </Link>
        </div>

        <p className="mt-6 max-w-md text-center text-xs text-muted">
          기물을 클릭하면 갈 수 있는 칸이 표시됩니다. 한 화면에서 두 사람이 번갈아 두는 모드입니다. 프로모션은 자동으로 퀸으로 진급합니다.
        </p>
      </motion.div>
    </main>
  );
}
