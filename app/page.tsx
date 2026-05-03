"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useRequireAuth, useSignOut } from "@/hooks/useAuth";

type TimeControl = 3 | 5 | 10;

export default function MainPage() {
  const { user, isLoading } = useRequireAuth();
  const signOut = useSignOut();
  const [timeControl, setTimeControl] = useState<TimeControl>(5);
  const [friendId, setFriendId] = useState("");

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">불러오는 중...</div>
      </main>
    );
  }

  const showComingSoon = (label: string, sprint: string) => {
    alert(`"${label}"는 ${sprint}에서 추가 예정입니다.`);
  };

  return (
    <main className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-lg font-bold tracking-[0.3em]"
          >
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
                  className={
                    "h-12 rounded-sm border text-sm font-medium tracking-tight transition-colors duration-150 " +
                    (timeControl === t
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-foreground hover:border-foreground")
                  }
                >
                  {t}분
                  <span className="ml-1 text-xs text-muted-foreground">
                    {timeControl === t ? "" : ""}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">
              {timeControl === 3 && "불릿 — 빠른 반응 게임"}
              {timeControl === 5 && "블리츠 — 표준 단판"}
              {timeControl === 10 && "래피드 — 여유롭게"}
            </p>
          </div>

          <div>
            <Button
              size="lg"
              className="w-full"
              onClick={() => showComingSoon("랭크 매칭", "Sprint 4")}
            >
              랭크 매칭 시작
            </Button>
          </div>

          <Divider>또는</Divider>

          <div className="space-y-2">
            <Label htmlFor="friendId">아이디로 도전 (친구전)</Label>
            <div className="flex gap-2">
              <Input
                id="friendId"
                placeholder="상대 아이디"
                value={friendId}
                onChange={(e) => setFriendId(e.target.value.trim())}
              />
              <Button
                variant="secondary"
                onClick={() => showComingSoon("친구전 도전", "Sprint 4")}
                disabled={!friendId}
              >
                도전
              </Button>
            </div>
          </div>

          <Divider>또는</Divider>

          <div className="space-y-3">
            <Link href="/play/ai" className="block">
              <Button variant="secondary" size="lg" className="w-full">
                AI와 두기
              </Button>
            </Link>
            <Link href="/play/local" className="block">
              <Button variant="ghost" size="lg" className="w-full">
                로컬 연습 (한 화면에서 둘이 두기)
              </Button>
            </Link>
          </div>
        </section>
      </motion.div>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-center gap-6 px-6 py-4 text-sm text-muted-foreground">
          <button
            onClick={() => showComingSoon("랭킹", "Sprint 5")}
            className="hover:text-foreground transition-colors"
          >
            랭킹
          </button>
          <span className="text-border">·</span>
          <button
            onClick={() => showComingSoon("프로필", "Sprint 5")}
            className="hover:text-foreground transition-colors"
          >
            프로필
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
