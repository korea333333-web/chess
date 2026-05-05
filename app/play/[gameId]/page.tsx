"use client";

import {
  use,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Chess, type Move } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Button } from "@/components/ui/Button";
import { useRequireAuth } from "@/hooks/useAuth";
import { ChessBoardSurface } from "@/components/ChessBoardSurface";
import { Clock } from "@/components/Clock";
import { GameEndModal, type GameResult } from "@/components/GameEndModal";
import { SoundToggle } from "@/components/SoundToggle";
import { sounds } from "@/lib/sound";
import { callApiAuthed } from "@/lib/api/client";

type GameDto = {
  id: string;
  white_id: string;
  white_username: string;
  black_id: string;
  black_username: string;
  time_control_min: number;
  is_ranked: boolean;
  status: "active" | "ended";
  fen: string;
  moves_pgn: string;
  white_ms: number;
  black_ms: number;
  last_move_at: number;
  last_move_by: string;
  result: "" | "white_wins" | "black_wins" | "draw";
  end_reason: string;
  draw_offer_by: string;
};

const POLL_INTERVAL_MS = 2000;
const CLOCK_TICK_MS = 100;

const END_REASON_KO: Record<string, string> = {
  checkmate: "체크메이트",
  resign: "항복",
  stalemate: "스테일메이트",
  agreement: "무승부 합의",
  draw: "무승부",
};

function pickAndPlay(mate: boolean, check: boolean, capture: boolean): void {
  if (mate) sounds.checkmate();
  else if (check) sounds.check();
  else if (capture) sounds.capture();
  else sounds.move();
}

export default function OnlineGamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = use(params);
  const { user, isLoading: authLoading } = useRequireAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [game, setGame] = useState<GameDto | null>(null);

  const chessRef = useRef<Chess | null>(null);
  if (chessRef.current === null) chessRef.current = new Chess();
  const lastFenRef = useRef<string>("");
  const lastMoveByRef = useRef<string>("");

  const [position, setPosition] = useState<string>(() => chessRef.current!.fen());
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [whiteMs, setWhiteMs] = useState(0);
  const [blackMs, setBlackMs] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const myColor: "w" | "b" | null = useMemo(() => {
    if (!game || !user) return null;
    if (game.white_id === user.id) return "w";
    if (game.black_id === user.id) return "b";
    return null;
  }, [game, user]);

  const opponentLabel = useMemo(() => {
    if (!game || !user) return "";
    return game.white_id === user.id
      ? game.black_username
      : game.white_username;
  }, [game, user]);

  const myLabel = user?.username ?? "";

  const opponentMs = myColor === "w" ? blackMs : whiteMs;
  const playerMs = myColor === "w" ? whiteMs : blackMs;

  const isMyTurn =
    !!game &&
    game.status === "active" &&
    !result &&
    chessRef.current?.turn() === myColor;

  // Polling loop. Pulls server state every POLL_INTERVAL_MS until the game
  // ends, applying server FEN to the local chess instance and surfacing
  // the result modal once the server reports `status === "ended"`.
  useEffect(() => {
    if (!gameId || authLoading || !user) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      const res = await callApiAuthed<{ game: GameDto }>("game", {
        game_id: gameId,
      });
      if (cancelled) return;

      if (!res.ok) {
        setLoadError(res.error);
        setLoading(false);
        return;
      }
      const g = res.game;
      setGame(g);
      setWhiteMs(g.white_ms);
      setBlackMs(g.black_ms);

      // Apply server FEN to local chess if it changed (i.e. an opponent
      // move arrived). If it's *my* most recent move that's reflected, the
      // local chess is already in sync — skip reload to avoid stutter.
      const localFen = chessRef.current!.fen();
      if (g.fen !== localFen && g.fen !== lastFenRef.current) {
        const newChess = new Chess();
        try {
          newChess.load(g.fen);
        } catch {
          // Bad FEN from server — leave local state untouched.
        }
        chessRef.current = newChess;
        setPosition(g.fen);
        setSelectedSquare(null);
        setLegalMoves([]);

        // Sound for opponent's move (skip when it was our own move).
        if (
          g.last_move_by &&
          g.last_move_by !== user.id &&
          g.last_move_by !== lastMoveByRef.current
        ) {
          pickAndPlay(
            newChess.isCheckmate(),
            newChess.isCheck(),
            // We can't tell capture vs quiet from FEN alone — default to
            // a regular move sound when no check/mate.
            false,
          );
        }
        lastMoveByRef.current = g.last_move_by;
      }
      lastFenRef.current = g.fen;

      if (g.status === "ended" && !result) {
        const myColorLocal: "w" | "b" =
          g.white_id === user.id ? "w" : "b";
        let outcome: "win" | "loss" | "draw";
        if (g.result === "draw") outcome = "draw";
        else if (
          (g.result === "white_wins" && myColorLocal === "w") ||
          (g.result === "black_wins" && myColorLocal === "b")
        )
          outcome = "win";
        else outcome = "loss";
        const reason =
          END_REASON_KO[g.end_reason] || "게임 종료";
        setResult({ outcome, reason });
      }

      if (loading) setLoading(false);

      if (g.status === "active") {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // We intentionally exclude `result` and `loading` from deps so the
    // poll loop continues uninterrupted across re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, authLoading, user]);

  // Local clock tick — decrement the side-to-move's remaining time. Server
  // values overwrite us on every poll, so any drift self-corrects.
  useEffect(() => {
    if (!game || game.status !== "active" || result) return;
    const id = setInterval(() => {
      const turn = chessRef.current?.turn();
      if (!turn) return;
      if (turn === "w") {
        setWhiteMs((prev) => Math.max(0, prev - CLOCK_TICK_MS));
      } else {
        setBlackMs((prev) => Math.max(0, prev - CLOCK_TICK_MS));
      }
    }, CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [game, result]);

  const submitMove = useCallback(
    async (from: string, to: string): Promise<boolean> => {
      if (submitting || !game || result) return false;
      const chess = chessRef.current!;
      let move: Move | null = null;
      try {
        move = chess.move({ from, to, promotion: "q" });
      } catch {
        return false;
      }
      if (!move) return false;

      const isCheck = chess.isCheck();
      const isCheckmate = chess.isCheckmate();
      const isStalemate = chess.isStalemate();
      const isDraw = chess.isDraw() && !isCheckmate;
      const isCapture =
        move.flags.includes("c") || move.flags.includes("e");

      setPosition(chess.fen());
      lastFenRef.current = chess.fen();
      lastMoveByRef.current = user?.id ?? "";
      setSelectedSquare(null);
      setLegalMoves([]);
      pickAndPlay(isCheckmate, isCheck, isCapture);

      setSubmitting(true);
      const res = await callApiAuthed("move", {
        game_id: game.id,
        fen: chess.fen(),
        moves_pgn: chess.pgn(),
        is_checkmate: isCheckmate,
        is_stalemate: isStalemate,
        is_draw: isDraw,
      });
      setSubmitting(false);

      if (!res.ok) {
        // Server refused — roll the move back locally.
        chess.undo();
        setPosition(chess.fen());
        lastFenRef.current = chess.fen();
        setActionError(res.error);
        return false;
      }
      return true;
    },
    [submitting, game, result, user],
  );

  const handlePieceDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }): boolean => {
      if (!targetSquare || !isMyTurn) return false;
      // Library calls this synchronously; we kick off the await but always
      // return true so the piece visually lands on the new square instantly.
      // If the server rejects, our submitMove will rewind the board.
      void submitMove(sourceSquare, targetSquare);
      return true;
    },
    [isMyTurn, submitMove],
  );

  const selectSquare = useCallback(
    (square: string) => {
      const chess = chessRef.current!;
      if (!isMyTurn) return;
      const piece = chess.get(square as Parameters<Chess["get"]>[0]);
      if (!piece || piece.color !== myColor) {
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
    [isMyTurn, myColor],
  );

  const handleSquareClick = useCallback(
    ({ square }: { square: string }) => {
      if (!isMyTurn || submitting) return;
      if (selectedSquare && selectedSquare === square) {
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }
      if (selectedSquare && legalMoves.some((m) => m.to === square)) {
        void submitMove(selectedSquare, square);
        return;
      }
      selectSquare(square);
    },
    [isMyTurn, submitting, selectedSquare, legalMoves, selectSquare, submitMove],
  );

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
    return styles;
  }, [position, selectedSquare, legalMoves]);

  const handleResign = useCallback(async () => {
    if (!game || result) return;
    if (!confirm("정말 항복하시겠습니까?")) return;
    const res = await callApiAuthed("resign", { game_id: game.id });
    if (!res.ok) setActionError(res.error);
  }, [game, result]);

  const handleDrawOffer = useCallback(async () => {
    if (!game || result) return;
    const action = game.draw_offer_by && game.draw_offer_by !== user?.id
      ? "accept"
      : "offer";
    const res = await callApiAuthed("draw", {
      game_id: game.id,
      op: action,
    });
    if (!res.ok) setActionError(res.error);
  }, [game, result, user]);

  if (authLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">불러오는 중...</div>
      </main>
    );
  }
  if (loadError) {
    return (
      <main className="flex min-h-screen flex-col">
        <PageHeader title="온라인 대전" />
        <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
          <p className="text-sm text-error">{loadError}</p>
          <Link href="/">
            <Button variant="secondary">메인으로</Button>
          </Link>
        </div>
      </main>
    );
  }
  if (loading || !game) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">게임 로딩 중...</div>
      </main>
    );
  }

  const opponentDrawOffered =
    !!game.draw_offer_by && game.draw_offer_by !== user.id;

  return (
    <main className="flex min-h-screen flex-col">
      <PageHeader title={game.is_ranked ? "랭크 매치" : "친구전"} />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-6 py-6"
      >
        <PlayerRow
          name={opponentLabel}
          ms={opponentMs}
          isActive={!isMyTurn && game.status === "active" && !result}
          subtitle={
            opponentDrawOffered ? "무승부 제안 중" : undefined
          }
        />

        <ChessBoardSurface className="my-4 w-full max-w-[560px] aspect-square">
          <Chessboard
            options={{
              position,
              onSquareClick: handleSquareClick,
              onPieceDrop: handlePieceDrop,
              squareStyles,
              animationDurationInMs: 200,
              showAnimations: true,
              allowDragging: isMyTurn && !submitting,
              canDragPiece: ({ piece }) =>
                myColor !== null &&
                piece.pieceType.charAt(0) === myColor,
              allowDrawingArrows: false,
              arrows: [],
              boardOrientation: myColor === "b" ? "black" : "white",
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
          name={myLabel}
          ms={playerMs}
          isActive={isMyTurn}
          subtitle={
            game.status === "active"
              ? isMyTurn
                ? submitting
                  ? "서버에 전송 중..."
                  : "내 차례"
                : "상대 차례"
              : undefined
          }
        />

        {actionError && (
          <p role="alert" className="mt-2 text-sm text-error">
            {actionError}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <Button
            variant="secondary"
            onClick={handleResign}
            disabled={!!result || game.status !== "active"}
          >
            항복
          </Button>
          <Button
            variant="secondary"
            onClick={handleDrawOffer}
            disabled={!!result || game.status !== "active"}
          >
            {opponentDrawOffered ? "무승부 수락" : "무승부 제안"}
          </Button>
          <Link href="/">
            <Button variant="ghost">메인</Button>
          </Link>
        </div>
      </motion.div>

      <GameEndModal
        open={result !== null}
        result={result}
        onPlayAgain={() => {
          // Online play-again: just send the user back to main to find a new match.
          window.location.href = "/";
        }}
        onExit={() => {
          window.location.href = "/";
        }}
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
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      <Clock ms={ms} isActive={isActive} className="min-w-[110px]" />
    </div>
  );
}
