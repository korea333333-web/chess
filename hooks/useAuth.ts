"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSession, signOut as doSignOut, type PublicUser } from "@/lib/auth";

export function useAuth() {
  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);

  useEffect(() => {
    setUser(getSession());
    const handler = (e: StorageEvent) => {
      if (e.key === "chess.session.v1" || e.key === null) {
        setUser(getSession());
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return {
    user,
    isLoading: user === undefined,
    refresh: () => setUser(getSession()),
  };
}

export function useRequireAuth() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user === null) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  return { user, isLoading };
}

export function useRequireGuest() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/");
    }
  }, [isLoading, user, router]);

  return { user, isLoading };
}

export function useSignOut() {
  const router = useRouter();
  return useCallback(() => {
    doSignOut();
    router.replace("/login");
  }, [router]);
}
