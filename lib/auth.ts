// Mock auth using localStorage. TODO Sprint 4: replace with Supabase Auth.
// Per-browser only — users registered in Chrome won't exist in Firefox.

const USERS_KEY = "chess.users.v1";
const SESSION_KEY = "chess.session.v1";

export type PublicUser = {
  id: string;
  username: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  createdAt: string;
};

type StoredUser = PublicUser & { passwordHash: string };

export type AuthResult =
  | { ok: true; user: PublicUser }
  | { ok: false; error: string };

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readUsers(): StoredUser[] {
  if (!isBrowser()) return [];
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]") as StoredUser[];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toPublic(user: StoredUser): PublicUser {
  const { passwordHash: _ignored, ...rest } = user;
  return rest;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export async function signUp(
  username: string,
  password: string,
): Promise<AuthResult> {
  if (!USERNAME_RE.test(username)) {
    return {
      ok: false,
      error: "아이디는 영문/숫자/_ 3-20자여야 합니다.",
    };
  }
  if (password.length < 6) {
    return { ok: false, error: "비밀번호는 6자 이상이어야 합니다." };
  }
  const users = readUsers();
  const dup = users.find(
    (u) => u.username.toLowerCase() === username.toLowerCase(),
  );
  if (dup) return { ok: false, error: "이미 사용 중인 아이디입니다." };

  const passwordHash = await hashPassword(password);
  const user: StoredUser = {
    id: crypto.randomUUID(),
    username,
    elo: 1200,
    wins: 0,
    losses: 0,
    draws: 0,
    createdAt: new Date().toISOString(),
    passwordHash,
  };
  users.push(user);
  writeUsers(users);

  const publicUser = toPublic(user);
  localStorage.setItem(SESSION_KEY, JSON.stringify(publicUser));
  return { ok: true, user: publicUser };
}

export async function signIn(
  username: string,
  password: string,
): Promise<AuthResult> {
  const users = readUsers();
  const user = users.find(
    (u) => u.username.toLowerCase() === username.toLowerCase(),
  );
  if (!user) {
    return {
      ok: false,
      error: "아이디 또는 비밀번호가 잘못되었습니다.",
    };
  }
  const passwordHash = await hashPassword(password);
  if (user.passwordHash !== passwordHash) {
    return {
      ok: false,
      error: "아이디 또는 비밀번호가 잘못되었습니다.",
    };
  }

  const publicUser = toPublic(user);
  localStorage.setItem(SESSION_KEY, JSON.stringify(publicUser));
  return { ok: true, user: publicUser };
}

export function signOut(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(SESSION_KEY);
}

export function getSession(): PublicUser | null {
  if (!isBrowser()) return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}
