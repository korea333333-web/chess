"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useRequireAuth } from "@/hooks/useAuth";
import { callApi } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type RankingEntry = {
  rank: number;
  username: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
};

export default function RankingPage() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const [rankings, setRankings] = useState<RankingEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    callApi<{ ranking: RankingEntry[] }>("ranking").then((res) => {
      if (res.ok) setRankings(res.ranking);
      else setError(res.error);
    });
  }, []);

  if (authLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">불러오는 중...</div>
      </main>
    );
  }

  const myRank = rankings?.find((r) => r.username === user.username);

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
            랭킹
          </span>
          <div className="w-12" />
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        className="mx-auto w-full max-w-2xl flex-1 px-6 py-8"
      >
        {error && (
          <p role="alert" className="mb-4 text-sm text-error">
            {error}
          </p>
        )}

        {rankings === null ? (
          <p className="text-center text-sm text-muted-foreground">
            랭킹 불러오는 중...
          </p>
        ) : rankings.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            아직 랭킹이 없습니다.
          </p>
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-[3rem_1fr_4rem_3rem_3rem_3rem] gap-2 border-b border-border pb-2 text-xs uppercase tracking-widest text-muted">
              <div>순위</div>
              <div>아이디</div>
              <div className="text-right">ELO</div>
              <div className="text-right">승</div>
              <div className="text-right">무</div>
              <div className="text-right">패</div>
            </div>
            {rankings.map((entry) => {
              const isMe = entry.username === user.username;
              return (
                <div
                  key={entry.username}
                  className={cn(
                    "grid grid-cols-[3rem_1fr_4rem_3rem_3rem_3rem] gap-2 rounded-sm px-1 py-2 text-sm transition-colors",
                    isMe && "bg-foreground/10 font-medium",
                  )}
                >
                  <div className="font-mono text-muted-foreground">
                    {entry.rank}
                  </div>
                  <div className="truncate">
                    {entry.username}
                    {isMe && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (나)
                      </span>
                    )}
                  </div>
                  <div className="text-right font-mono">{entry.elo}</div>
                  <div className="text-right font-mono text-muted-foreground">
                    {entry.wins}
                  </div>
                  <div className="text-right font-mono text-muted-foreground">
                    {entry.draws}
                  </div>
                  <div className="text-right font-mono text-muted-foreground">
                    {entry.losses}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {myRank === undefined && rankings && rankings.length > 0 && (
          <p className="mt-4 text-center text-xs text-muted">
            (상위 100명에 들면 본인 순위가 표시됩니다.)
          </p>
        )}

        <div className="mt-8 text-center">
          <Link href="/">
            <Button variant="ghost">메인으로</Button>
          </Link>
        </div>
      </motion.div>
    </main>
  );
}
