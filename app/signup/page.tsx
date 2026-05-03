"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { signUp } from "@/lib/auth";
import { useRequireGuest } from "@/hooks/useAuth";

export default function SignupPage() {
  useRequireGuest();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await signUp(username, password);
    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    router.replace("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-10 text-center">
          <Link
            href="/login"
            className="inline-block text-2xl font-bold tracking-[0.3em]"
          >
            CHESS
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">회원가입</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">아이디</Label>
            <Input
              id="username"
              autoComplete="username"
              autoFocus
              required
              minLength={3}
              maxLength={20}
              value={username}
              onChange={(e) => setUsername(e.target.value.trim())}
              disabled={submitting}
            />
            <p className="text-xs text-muted">
              영문/숫자/_ 3-20자
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
            <p className="text-xs text-muted">
              6자 이상. 분실 시 복구 불가합니다.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="text-sm text-error"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={submitting}
          >
            {submitting ? "가입 중..." : "회원가입"}
          </Button>
        </form>

        <div className="mt-8 border-t border-border pt-6 text-center text-sm text-muted-foreground">
          이미 계정이 있으신가요?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            로그인
          </Link>
        </div>
      </motion.div>
    </main>
  );
}
