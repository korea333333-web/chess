"use client";

// Apps Script-backed auth. Session token is stored in localStorage and sent
// with every authed API call. The token is invalidated server-side on logout.

import { callApi, callApiAuthed, getToken, setToken } from "./api/client";

export type PublicUser = {
  id: string;
  username: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
};

export type AuthResult =
  | { ok: true; user: PublicUser }
  | { ok: false; error: string };

type AuthApiPayload = { token: string; user: PublicUser };

export async function signUp(
  username: string,
  password: string,
): Promise<AuthResult> {
  const res = await callApi<AuthApiPayload>("signup", { username, password });
  if (!res.ok) return { ok: false, error: res.error };
  setToken(res.token);
  return { ok: true, user: res.user };
}

export async function signIn(
  username: string,
  password: string,
): Promise<AuthResult> {
  const res = await callApi<AuthApiPayload>("login", { username, password });
  if (!res.ok) return { ok: false, error: res.error };
  setToken(res.token);
  return { ok: true, user: res.user };
}

export async function signOut(): Promise<void> {
  const token = getToken();
  setToken(null);
  if (token) {
    // Best effort — the local session is already gone even if this fails.
    await callApi("logout", { token }).catch(() => undefined);
  }
}

export async function getSession(): Promise<PublicUser | null> {
  const token = getToken();
  if (!token) return null;
  const res = await callApiAuthed<{ user: PublicUser }>("me");
  if (!res.ok) {
    setToken(null);
    return null;
  }
  return res.user;
}
