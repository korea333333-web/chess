"use client";

import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Chess, type Move } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { useRequireAuth } from "@/hooks/useAuth";
import { SoundToggle } from "@/components/SoundToggle";
import { Clock } from "@/components/Clock";
import { GameEndModal, type GameResult } from "@/components/GameEndModal";
import { ChessBoardSurface } from "@/components/ChessBoardSurface";
import { sounds } from "@/lib/sound";
import {
  findBestMoveAsync,
  DIFFICULTY_LEVELS,
  type Difficulty,
} from "@/lib/ai";
import { cn } from "@/lib/utils";

type ColorChoice = "w" | "b" | "random";
type TimeChoice = 3 | 5 | 10;
type Phase = "setup" | "playing";

function playMoveSound(move: Move, chess: Chess): void {
  pickAndPlay(
    chess.isCheckmate(),
    chess.isCheck(),
    move.flags.includes("c") || move.flags.includes("e"),
  );
}

function pickAndPlay(mate: boolean, check: boolean, capture: boolean): void {
  if (mate) {
    sounds.checkmate();
    return;
  }
  if (check) {
    sounds.check();
    return;
  }
  if (capture) {
    sounds.capture();
    return;
  }
  sounds.move();
}

export default function AiPlayPage() {
  const { user, isLoading } = useRequireAuth();

  const [phase, setPhase] = useState<Phase>("setup");
  const [colorChoice, setColorChoice] = useState<ColorChoice>("w");
  const [difficulty, setDifficulty] = useState<Difficulty>(1);
  const [timeChoice, setTimeChoice] = useState<TimeChoice>(5);

  const chessRef = useRef<Chess | null>(null);
  const isOverRef = useRef(false);

  const [position, setPosition] = useState("");
  const [moveCount, setMoveCount] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [playerColor, setPlayerColor] = useState<"w" | "b">("w");
  const [whiteMs, setWhiteMs] = useState(0);
  const [blackMs, setBlackMs] = useState(0);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  // chess.com-style premove queue: multiple moves can be lined up while
  // the AI is thinking. Each AI response consumes the head of the queue;
  // an illegal head clears the entire chain.
  const [premoves, setPremoves] = useState<
    Array<{ from: string; to: string }>
  >([]);
  const premovesRef = useRef<Array<{ from: string; to: string }>>([]);
  useEffect(() => {
    premovesRef.current = premoves;
  }, [premoves]);
  const selectedSquareRef = useRef<string | null>(null);
  useEffect(() => {
    selectedSquareRef.current = selectedSquare;
  }, [selectedSquare]);

  useEffect(() => {
    isOverRef.current = phase !== "playing" || result !== null;
  }, [phase, result]);

  const startGame = useCallback(() => {
    const actualColor: "w" | "b" =
      colorChoice === "random"
        ? Math.random() < 0.5
          ? "w"
          : "b"
        : colorChoice;
    const initialMs = timeChoice * 60 * 1000;
    chessRef.current = new Chess();
    setPlayerColor(actualColor);
    setPosition(chessRef.current.fen());
    setMoveCount(0);
    setSelectedSquare(null);
    setLegalMoves([]);
    setWhiteMs(initialMs);
    setBlackMs(initialMs);
    setIsAiThinking(false);
    setResult(null);
    setPremoves([]);
    setPhase("playing");
    sounds.start();
  }, [colorChoice, timeChoice]);

  const exitGame = useCallback(() => {
    setPhase("setup");
    setResult(null);
  }, []);

  const checkGameEnd = useCallback(
    (chess: Chess): GameResult | null => {
      if (chess.isCheckmate()) {
        const loserTurn = chess.turn();
        const winner = loserTurn === "w" ? "b" : "w";
        return {
          outcome: winner === playerColor ? "win" : "loss",
          reason: "체크메이트",
        };
      }
      if (chess.isStalemate()) {
        return { outcome: "draw", reason: "스테일메이트" };
      }
      if (chess.isDraw()) {
        return {
          outcome: "draw",
          reason: chess.isDrawByFiftyMoves() ? "50수 규칙" : "무승부",
        };
      }
      return null;
    },
    [playerColor],
  );

  // Clock tick
  useEffect(() => {
    if (phase !== "playing" || result) return;
    const interval = setInterval(() => {
      const chess = chessRef.current;
      if (!chess) return;
      const turn = chess.turn();
      if (turn === "w") {
        setWhiteMs((prev) => Math.max(0, prev - 100));
      } else {
        setBlackMs((prev) => Math.max(0, prev - 100));
      }
    }, 100);
    return () => clearInterval(interval);
  }, [phase, result]);

  // Timeout detection
  useEffect(() => {
    if (phase !== "playing" || result) return;
    if (whiteMs <= 0) {
      setResult({
        outcome: playerColor === "w" ? "loss" : "win",
        reason: "시간 초과",
      });
    } else if (blackMs <= 0) {
      setResult({
        outcome: playerColor === "b" ? "loss" : "win",
        reason: "시간 초과",
      });
    }
  }, [whiteMs, blackMs, phase, result, playerColor]);

  // AI move loop. After AI plays, we atomically attempt a queued premove
  // (if any) inside the same state batch. This avoids a frame where the
  // AI's new position is rendered with the premove still highlighted —
  // which used to make captured pieces appear to linger.
  useEffect(() => {
    if (phase !== "playing" || result) return;
    const chess = chessRef.current;
    if (!chess) return;
    if (chess.turn() === playerColor) return;
    if (isAiThinking) return;
    if (chess.isGameOver()) return;

    setIsAiThinking(true);
    findBestMoveAsync(chess.fen(), difficulty).then((aiMove) => {
      setIsAiThinking(false);
      if (!aiMove) return;
      if (isOverRef.current) return;
      const c = chessRef.current;
      if (!c || c.isGameOver()) return;

      let plies = 0;

      // Apply AI's move and capture its state for sound.
      let aiCheck = false;
      let aiCheckmate = false;
      let aiCapture = false;
      try {
        const aiM = c.move({
          from: aiMove.from,
          to: aiMove.to,
          promotion: aiMove.promotion,
        });
        plies++;
        aiCheck = c.isCheck();
        aiCheckmate = c.isCheckmate();
        aiCapture = aiM.flags.includes("c") || aiM.flags.includes("e");
      } catch {
        return;
      }

      let end = checkGameEnd(c);

      // Try the head of the premove queue. Each AI iteration consumes at
      // most one premove. If the head is illegal in the new position, the
      // entire chain is discarded (a typical chess.com behavior).
      let pmApplied = false;
      let pmCheck = false;
      let pmCheckmate = false;
      let pmCapture = false;
      const queue = premovesRef.current;
      let nextQueue: Array<{ from: string; to: string }> = queue;
      if (!end && queue.length > 0) {
        const head = queue[0];
        try {
          const pmM = c.move({
            from: head.from,
            to: head.to,
            promotion: "q",
          });
          if (pmM) {
            plies++;
            pmApplied = true;
            pmCheck = c.isCheck();
            pmCheckmate = c.isCheckmate();
            pmCapture = pmM.flags.includes("c") || pmM.flags.includes("e");
            end = checkGameEnd(c);
            nextQueue = queue.slice(1);
          } else {
            nextQueue = [];
          }
        } catch {
          nextQueue = [];
        }
      }

      // Sounds: AI's move now, premove's a beat later (synced to animation).
      pickAndPlay(aiCheckmate, aiCheck, aiCapture);
      if (pmApplied) {
        setTimeout(() => {
          pickAndPlay(pmCheckmate, pmCheck, pmCapture);
        }, 220);
      }

      setPosition(c.fen());
      setMoveCount((n) => n + plies);
      setPremoves(nextQueue);

      // Selection persistence: if the player had selected a piece during the
      // AI's turn but didn't queue a premove, keep the selection on their
      // turn so they don't have to re-click.
      const sel = pmApplied ? null : selectedSquareRef.current;
      if (
        sel &&
        c.turn() === playerColor &&
        c.get(sel as Parameters<Chess["get"]>[0])?.color === playerColor
      ) {
        const moves = c.moves({
          square: sel as Parameters<Chess["moves"]>[0]["square"],
          verbose: true,
        }) as Move[];
        setSelectedSquare(sel);
        setLegalMoves(moves);
      } else {
        setSelectedSquare(null);
        setLegalMoves([]);
      }

      // Brief delay before showing the game-end modal so the final move
      // animation can play and the user sees the resulting position.
      if (end) {
        setTimeout(() => setResult(end), 500);
      }
    });
  }, [
    phase,
    result,
    position,
    playerColor,
    difficulty,
    isAiThinking,
    checkGameEnd,
  ]);

  const tryMove = useCallback(
    (from: string, to: string): boolean => {
      const chess = chessRef.current;
      if (!chess) return false;
      try {
        const move = chess.move({ from, to, promotion: "q" });
        if (!move) return false;
        playMoveSound(move, chess);
        setPosition(chess.fen());
        setMoveCount((n) => n + 1);
        setSelectedSquare(null);
        setLegalMoves([]);
        const end = checkGameEnd(chess);
        if (end) setResult(end);
        return true;
      } catch {
        return false;
      }
    },
    [checkGameEnd],
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
      if (sourceSquare === targetSquare) return false;
      const chess = chessRef.current;
      if (!chess) return false;
      if (result) return false;

      if (chess.turn() === playerColor) {
        // My turn — go through the real chess board.
        const piece = chess.get(sourceSquare as Parameters<Chess["get"]>[0]);
        if (!piece || piece.color !== playerColor) return false;
        return tryMove(sourceSquare, targetSquare);
      }

      // AI's turn — append to the premove queue. The piece check is
      // against the speculative chess (with prior premoves applied),
      // so chained drags work even though the real board hasn't moved.
      const real = chessRef.current!;
      const spec = new Chess(real.fen());
      for (const pm of premovesRef.current) {
        const p = spec.get(pm.from as Parameters<Chess["get"]>[0]);
        if (!p) break;
        spec.remove(pm.from as Parameters<Chess["remove"]>[0]);
        spec.remove(pm.to as Parameters<Chess["remove"]>[0]);
        spec.put(p, pm.to as Parameters<Chess["put"]>[1]);
      }
      const piece = spec.get(sourceSquare as Parameters<Chess["get"]>[0]);
      if (!piece || piece.color !== playerColor) return false;
      setPremoves((prev) => [
        ...prev,
        { from: sourceSquare, to: targetSquare },
      ]);
      setSelectedSquare(null);
      setLegalMoves([]);
      return false;
    },
    [playerColor, result, tryMove],
  );

  const selectSquare = useCallback(
    (square: string) => {
      const chess = chessRef.current;
      if (!chess) return;
      if (result) return;
      if (chess.turn() !== playerColor) return;
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
    [playerColor, result],
  );

  const handleSquareClick = useCallback(
    ({ square }: { square: string }) => {
      const chess = chessRef.current;
      if (!chess) return;
      if (result) return;

      const isPlayerTurn = chess.turn() === playerColor;

      if (isPlayerTurn) {
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
        return;
      }

      // AI's turn — premove queue mode.
      // Clicking on a queued premove from/to cancels that one and any
      // premoves stacked on top of it (since they were planned against a
      // position that no longer holds).
      const cancelIdx = premoves.findIndex(
        (pm) => pm.from === square || pm.to === square,
      );
      if (cancelIdx >= 0) {
        setPremoves(premoves.slice(0, cancelIdx));
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }
      if (selectedSquare && selectedSquare === square) {
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }
      // Build a speculative position with the existing queue applied so
      // that "is the from-square my piece?" reflects the chained state.
      const spec = new Chess(chess.fen());
      for (const pm of premoves) {
        const p = spec.get(pm.from as Parameters<Chess["get"]>[0]);
        if (!p) break;
        spec.remove(pm.from as Parameters<Chess["remove"]>[0]);
        spec.remove(pm.to as Parameters<Chess["remove"]>[0]);
        spec.put(p, pm.to as Parameters<Chess["put"]>[1]);
      }
      if (selectedSquare) {
        const fromPiece = spec.get(
          selectedSquare as Parameters<Chess["get"]>[0],
        );
        if (fromPiece && fromPiece.color === playerColor) {
          setPremoves((prev) => [
            ...prev,
            { from: selectedSquare, to: square },
          ]);
        }
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }
      const piece = spec.get(square as Parameters<Chess["get"]>[0]);
      if (piece && piece.color === playerColor) {
        setSelectedSquare(square);
        setLegalMoves([]);
      }
    },
    [
      result,
      playerColor,
      selectedSquare,
      legalMoves,
      premoves,
      selectSquare,
      tryMove,
    ],
  );

  // Speculative position with all queued premoves applied. Shown to the
  // player so they can plan multi-move chains while the AI is thinking.
  // Uses chess.js put/remove (no rule validation) so chains of "what if"
  // moves can be visualized even if a later move depends on an earlier
  // hypothetical capture.
  const displayPosition = useMemo(() => {
    if (!chessRef.current) return position;
    if (premoves.length === 0) return position;
    const spec = new Chess(chessRef.current.fen());
    for (const pm of premoves) {
      const piece = spec.get(pm.from as Parameters<Chess["get"]>[0]);
      if (!piece) break;
      spec.remove(pm.from as Parameters<Chess["remove"]>[0]);
      spec.remove(pm.to as Parameters<Chess["remove"]>[0]);
      const isPromotion =
        piece.type === "p" && (pm.to[1] === "8" || pm.to[1] === "1");
      spec.put(
        isPromotion ? { type: "q", color: piece.color } : piece,
        pm.to as Parameters<Chess["put"]>[1],
      );
    }
    return spec.fen();
  }, [position, premoves]);

  // (Premove application now happens inside the AI move callback above
  // so that AI's move and the premove commit in a single React batch.)

  const squareStyles = useMemo<Record<string, React.CSSProperties>>(() => {
    const chess = chessRef.current;
    if (!chess) return {};
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

    const premoveStyle: React.CSSProperties = {
      boxShadow:
        "inset 0 0 0 100px rgba(220,38,38,0.55), inset 0 0 0 4px rgba(127,29,29,1)",
    };
    for (const pm of premoves) {
      styles[pm.from] = {
        ...(styles[pm.from] ?? {}),
        ...premoveStyle,
      };
      styles[pm.to] = {
        ...(styles[pm.to] ?? {}),
        ...premoveStyle,
      };
    }

    return styles;
  }, [position, selectedSquare, legalMoves, premoves]);

  const handleResign = useCallback(() => {
    if (!chessRef.current || result) return;
    if (!confirm("정말 항복하시겠습니까?")) return;
    setResult({ outcome: "loss", reason: "항복" });
  }, [result]);

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">불러오는 중...</div>
      </main>
    );
  }

  if (phase === "setup") {
    return (
      <main className="flex min-h-screen flex-col">
        <PageHeader title="AI 와 두기" />
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
          className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10"
        >
          <section className="space-y-8">
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-widest text-muted">
                내 색깔
              </Label>
              <SegmentedControl
                value={colorChoice}
                options={[
                  { value: "w", label: "백" },
                  { value: "b", label: "흑" },
                  { value: "random", label: "랜덤" },
                ]}
                onChange={setColorChoice}
              />
            </div>

            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-widest text-muted">
                난이도
              </Label>
              <SegmentedControl
                value={difficulty}
                options={DIFFICULTY_LEVELS.map((l) => ({
                  value: l.id,
                  label: l.label,
                }))}
                onChange={(v) => setDifficulty(v as Difficulty)}
              />
              <p className="text-xs text-muted">
                {DIFFICULTY_LEVELS[difficulty].description}
              </p>
            </div>

            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-widest text-muted">
                시간
              </Label>
              <SegmentedControl
                value={timeChoice}
                options={[
                  { value: 3, label: "3분" },
                  { value: 5, label: "5분" },
                  { value: 10, label: "10분" },
                ]}
                onChange={(v) => setTimeChoice(v as TimeChoice)}
              />
              <p className="text-xs text-muted">
                {timeChoice === 3 && "불릿 — 빠른 반응 게임"}
                {timeChoice === 5 && "블리츠 — 표준 단판"}
                {timeChoice === 10 && "래피드 — 여유롭게"}
              </p>
            </div>

            <Button size="lg" className="w-full" onClick={startGame}>
              시작
            </Button>
          </section>
        </motion.div>
      </main>
    );
  }

  // phase === 'playing'
  const opponentLabel = `AI · ${DIFFICULTY_LEVELS[difficulty].label}`;
  const playerLabel = user.username;
  const opponentMs = playerColor === "w" ? blackMs : whiteMs;
  const playerMs = playerColor === "w" ? whiteMs : blackMs;
  const isPlayerTurn = chessRef.current?.turn() === playerColor && !result;
  const isOpponentTurn = !isPlayerTurn && !result;

  return (
    <main className="flex min-h-screen flex-col">
      <PageHeader title="AI 와 두기" />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-6 py-6"
      >
        <PlayerRow
          name={opponentLabel}
          ms={opponentMs}
          isActive={isOpponentTurn}
          subtitle={isAiThinking ? "생각 중..." : undefined}
        />

        <ChessBoardSurface className="my-4 w-full max-w-[560px] aspect-square">
          <Chessboard
            options={{
              position: displayPosition,
              onSquareClick: handleSquareClick,
              onPieceDrop: handlePieceDrop,
              squareStyles,
              animationDurationInMs: 200,
              showAnimations: true,
              allowDragging: !result,
              canDragPiece: ({ piece }) =>
                piece.pieceType.charAt(0) === playerColor,
              allowDrawingArrows: false,
              arrows: [],
              boardOrientation: playerColor === "w" ? "white" : "black",
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

        <PlayerRow
          name={playerLabel}
          ms={playerMs}
          isActive={isPlayerTurn}
          subtitle={
            premoves.length > 0
              ? `미리둠 ${premoves.length}수 대기 중`
              : `수 ${moveCount}`
          }
        />

        <div className="mt-6 flex gap-3">
          <Button
            variant="secondary"
            onClick={handleResign}
            disabled={!!result}
          >
            항복
          </Button>
          <Button variant="ghost" onClick={exitGame}>
            나가기
          </Button>
        </div>
      </motion.div>

      <GameEndModal
        open={result !== null}
        result={result}
        onPlayAgain={() => {
          setResult(null);
          startGame();
        }}
        onExit={exitGame}
      />
    </main>
  );
}

function PageHeader({ title }: { title: string }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← 메인
        </Link>
        <span className="text-xs uppercase tracking-widest text-muted">
          {title}
        </span>
        <SoundToggle />
      </div>
    </header>
  );
}

function PlayerRow({
  name,
  ms,
  isActive,
  subtitle,
}: {
  name: string;
  ms: number;
  isActive: boolean;
  subtitle?: string;
}) {
  return (
    <div className="flex w-full max-w-[560px] items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium tracking-tight">{name}</p>
        {subtitle && (
          <p className="text-xs text-muted">{subtitle}</p>
        )}
      </div>
      <Clock ms={ms} isActive={isActive} className="min-w-[110px]" />
    </div>
  );
}

type SegmentOption<T> = { value: T; label: string };

function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        options.length === 2 && "grid-cols-2",
        options.length === 3 && "grid-cols-3",
        options.length === 4 && "grid-cols-4",
      )}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "h-12 rounded-sm border text-sm font-medium tracking-tight",
              "transition-colors duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              isSelected
                ? "border-foreground bg-foreground text-background"
                : "border-border text-foreground hover:border-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
