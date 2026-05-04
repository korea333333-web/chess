"use client";

// Apps Script API client.
// All requests are POSTed as text/plain JSON to dodge the CORS preflight
// that Apps Script's Web App URL doesn't support cleanly. The server reads
// `e.postData.contents` regardless of Content-Type.

const API_URL = process.env.NEXT_PUBLIC_API_URL!;
const TOKEN_KEY = "chess.token.v1";

export type ApiOk<T> = { ok: true } & T;
export type ApiErr = { ok: false; error: string };
export type ApiResult<T> = ApiOk<T> | ApiErr;

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function callApi<T = Record<string, unknown>>(
  action: string,
  body: Record<string, unknown> = {},
): Promise<ApiResult<T>> {
  if (!API_URL) {
    return { ok: false, error: "API URL not configured" };
  }
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, ...body }),
      redirect: "follow",
    });
    const data = (await res.json()) as ApiResult<T>;
    return data;
  } catch (err) {
    return {
      ok: false,
      error: `네트워크 오류: ${(err as Error).message ?? "unknown"}`,
    };
  }
}

export async function callApiAuthed<T = Record<string, unknown>>(
  action: string,
  body: Record<string, unknown> = {},
): Promise<ApiResult<T>> {
  const token = getToken();
  if (!token) return { ok: false, error: "Not authenticated" };
  return callApi<T>(action, { ...body, token });
}
