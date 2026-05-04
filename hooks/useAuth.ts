"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getSession,
  signOut as doSignOut,
  type PublicUser,
} from "@/lib/auth";

export function useAuth() {
  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getSession().then((u) => {
      if (!cancelled) setUser(u);
    });

    // Cross-tab logout: when localStorage token changes elsewhere, refresh.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "chess.token.v1" && e.key !== null) return;
      getSession().then((u) => {
        if (!cancelled) setUser(u);
      });
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const refresh = useCallback(async () => {
    const u = await getSession();
    setUser(u);
  }, []);

  return {
    user,
    isLoading: user === undefined,
    refresh,
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
  return useCallback(async () => {
    await doSignOut();
    router.replace("/login");
  }, [router]);
}
