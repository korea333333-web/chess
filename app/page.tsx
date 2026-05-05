"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useRequireAuth, useSignOut } from "@/hooks/useAuth";
import { callApiAuthed } from "@/lib/api/client";

type TimeControl = 3 | 5 | 10;
type MatchState =
  | { kind: "idle" }
  | { kind: "searching"; tc: TimeControl; since: number };

type IncomingInvite = {
  id: string;
  from_username: string;
  time_control_min: number;
  created_at: number;
};

const POLL_MATCH_MS = 2500;
const POLL_INVITES_MS = 5000;

export default function MainPage() {
  const { user, isLoading } = useRequireAuth();
  const signOut = useSignOut();
  const router = useRouter();

  const [timeControl, setTimeControl] = useState<TimeControl>(5);
  const [friendId, setFriendId] = useState("");
  const [matchState, setMatchState] = useState<MatchState>({ kind: "idle" });
  const [matchError, setMatchError] = useState<string | null>(null);
  const [friendError, setFriendError] = useState<string | null>(null);
  const [friendBusy, setFriendBusy] = useState(false);
  const [incoming, setIncoming] = useState<IncomingInvite[]>([]);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const [tick, setTick] = useState(0); // forces re-render every second for elapsed counter

  // Searching loop: poll matchmake every POLL_MATCH_MS until matched.
  useEffect(() => {
    if (matchState.kind !== "searching") return;
    cancelledRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const attempt = async () => {
      if (cancelledRef.current) return;
      const res = await callApiAuthed<{
        matched: boolean;
        game_id?: string;
      }>("matchmake", { time_control_min: matchState.tc });
      if (cancelledRef.current) return;
      if (!res.ok) {
        setMatchError(res.error);
        setMatchState({ kind: "idle" });
        return;
      }
      if (res.matched && res.game_id) {
        cancelledRef.current = true;
        router.push(`/play/${res.game_id}`);
        return;
      }
      timer = setTimeout(attempt, POLL_MATCH_MS);
    };
    attempt();
    return () => {
      cancelledRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [matchState, router]);

  // Tick once a second so the "찾는 중 12s" counter updates.
  useEffect(() => {
    if (matchState.kind !== "searching") return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [matchState]);

  // Poll for incoming friend-match invites while idle on the main page.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const fetchInvites = async () => {
      const res = await callApiAuthed<{
        incoming: IncomingInvite[];
      }>("invites_pending");
      if (cancelled) return;
      if (res.ok) setIncoming(res.incoming || []);
    };
    fetchInvites();
    const id = setInterval(fetchInvites, POLL_INVITES_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  const respondToInvite = useCallback(
    async (inviteId: string, accept: boolean) => {
      setRespondingTo(inviteId);
      const res = await callApiAuthed<{ game_id?: string }>(
        "invite_respond",
        { invite_id: inviteId, accept },
      );
      setRespondingTo(null);
      if (!res.ok) {
        setFriendError(res.error);
        return;
      }
      // Optimistic remove
      setIncoming((arr) => arr.filter((i) => i.id !== inviteId));
      if (accept && res.game_id) {
        router.push(`/play/${res.game_id}`);
      }
    },
    [router],
  );

  const startMatch = useCallback(() => {
    setMatchError(null);
    setMatchState({ kind: "searching", tc: timeControl, since: Date.now() });
  }, [timeControl]);

  const cancelMatch = useCallback(async () => {
    cancelledRef.current = true;
    setMatchState({ kind: "idle" });
    await callApiAuthed("unmatch").catch(() => undefined);
  }, []);

  const challengeFriend = useCallback(async () => {
    if (!friendId) return;
    setFriendError(null);
    setFriendBusy(true);
    const res = await callApiAuthed<{ invite_id: string }>("invite", {
      to_username: friendId,
      time_control_min: timeControl,
    });
    setFriendBusy(false);
    if (!res.ok) {
      setFriendError(res.error);
      return;
    }
    setFriendId("");
    setFriendError("초대를 보냈습니다. 상대가 수락하면 자동으로 게임이 시작됩니다.");
  }, [friendId, timeControl]);

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">불러오는 중...</div>
      </main>
    );
  }

  const isSearching = matchState.kind === "searching";
  const elapsedSec = isSearching
    ? Math.max(0, Math.floor((Date.now() - matchState.since) / 1000))
    : 0;
  // tick is read so the counter updates each second
  void tick;

  return (
    <main className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold tracking-[0.3em]">
            CHESS
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{user.username}</span>
              <span className="ml-2 font-mono">{user.elo}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              로그아웃
            </Button>
          </div>
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10"
      >
        <AnimatePresence>
          {incoming.length > 0 && (
            <motion.div
              key="invites"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="mb-6 space-y-2"
            >
              {incoming.map((inv) => {
                const busy = respondingTo === inv.id;
                return (
                  <div
                    key={inv.id}
                    className="rounded-sm border border-foreground bg-foreground/5 p-3"
                  >
                    <p className="text-sm">
                      <span className="font-medium">{inv.from_username}</span>{" "}
                      님의 친구전 도전 ({inv.time_control_min}분)
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => respondToInvite(inv.id, true)}
                        disabled={busy}
                      >
                        {busy ? "..." : "수락"}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => respondToInvite(inv.id, false)}
                        disabled={busy}
                      >
                        거절
                      </Button>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        <section className="space-y-8">
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-widest text-muted">
              시간 제어
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {([3, 5, 10] as TimeControl[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTimeControl(t)}
                  disabled={isSearching}
                  className={
                    "h-12 rounded-sm border text-sm font-medium tracking-tight transition-colors duration-150 disabled:opacity-50 " +
                    (timeControl === t
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-foreground hover:border-foreground")
                  }
                >
                  {t}분
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">
              {timeControl === 3 && "불릿 — 빠른 반응 게임"}
              {timeControl === 5 && "블리츠 — 표준 단판"}
              {timeControl === 10 && "래피드 — 여유롭게"}
            </p>
          </div>

          <AnimatePresence mode="wait">
            {isSearching ? (
              <motion.div
                key="searching"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-3 rounded-sm border border-foreground p-4 text-center"
              >
                <p className="font-mono text-sm tracking-tight">
                  매칭 중...{" "}
                  <span className="text-muted-foreground">
                    {elapsedSec < 30
                      ? `${elapsedSec}s`
                      : elapsedSec < 60
                        ? `${elapsedSec}s · 범위 확장`
                        : `${elapsedSec}s · 더 넓게 찾는 중`}
                  </span>
                </p>
                <p className="text-xs text-muted">
                  같은 시간으로 검색 중인 사람과 자동 매칭됩니다.
                </p>
                <Button variant="secondary" size="sm" onClick={cancelMatch}>
                  취소
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="start"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Button size="lg" className="w-full" onClick={startMatch}>
                  랭크 매칭 시작
                </Button>
                {matchError && (
                  <p className="mt-2 text-sm text-error" role="alert">
                    {matchError}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <Divider>또는</Divider>

          <div className="space-y-2">
            <Label htmlFor="friendId">아이디로 도전 (친구전)</Label>
            <div className="flex gap-2">
              <Input
                id="friendId"
                placeholder="상대 아이디"
                value={friendId}
                onChange={(e) => setFriendId(e.target.value.trim())}
                disabled={friendBusy || isSearching}
              />
              <Button
                variant="secondary"
                onClick={challengeFriend}
                disabled={!friendId || friendBusy || isSearching}
              >
                {friendBusy ? "..." : "도전"}
              </Button>
            </div>
            {friendError && (
              <p
                className={
                  friendError.startsWith("초대를")
                    ? "text-xs text-muted-foreground"
                    : "text-sm text-error"
                }
                role="alert"
              >
                {friendError}
              </p>
            )}
          </div>

          <Divider>또는</Divider>

          <div className="space-y-3">
            <Link href="/play/ai" className="block">
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                disabled={isSearching}
              >
                AI와 두기
              </Button>
            </Link>
            <Link href="/play/local" className="block">
              <Button
                variant="ghost"
                size="lg"
                className="w-full"
                disabled={isSearching}
              >
                로컬 연습 (한 화면에서 둘이 두기)
              </Button>
            </Link>
          </div>
        </section>
      </motion.div>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-center gap-6 px-6 py-4 text-sm text-muted-foreground">
          <button className="hover:text-foreground transition-colors opacity-50 cursor-not-allowed">
            랭킹 (Sprint 5)
          </button>
          <span className="text-border">·</span>
          <button className="hover:text-foreground transition-colors opacity-50 cursor-not-allowed">
            프로필 (Sprint 5)
          </button>
        </div>
      </footer>
    </main>
  );
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-muted">
      <div className="h-px flex-1 bg-border" />
      <span>{children}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
