"use client";

import type { Action } from "./game";
import type { RoomView } from "./types";

export interface Session {
  playerId: string;
  token: string;
}

const NAME_KEY = "blabber:name";
const sessionKey = (code: string) => `blabber:session:${code.toUpperCase()}`;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode etc. */
  }
}

export const getSavedName = () => safeGet(NAME_KEY) ?? "";
export const saveName = (name: string) => safeSet(NAME_KEY, name);

export function getSession(code: string): Session | null {
  const raw = safeGet(sessionKey(code));
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    return s.playerId && s.token ? s : null;
  } catch {
    return null;
  }
}
export const saveSession = (code: string, s: Session) => safeSet(sessionKey(code), JSON.stringify(s));
export const clearSession = (code: string) => safeSet(sessionKey(code), null);

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new ApiError("Connection problem — retrying…", 0);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(data.error || `Error ${res.status}`, res.status);
  return data;
}

const post = <T>(url: string, body: unknown) =>
  call<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  create: (name: string) => post<{ code: string } & Session>("/api/rooms", { name }),
  join: (code: string, name: string, session?: Session | null) =>
    post<{ code: string; audience: boolean } & Session>(`/api/rooms/${code}/join`, { name, ...(session ?? {}) }),
  poll: (code: string, s: Session, ping: boolean) =>
    call<RoomView>(
      `/api/rooms/${code}?pid=${encodeURIComponent(s.playerId)}&token=${encodeURIComponent(s.token)}${ping ? "&ping=1" : ""}`,
    ),
  act: (code: string, s: Session, action: Action) =>
    post<RoomView>(`/api/rooms/${code}/action`, { pid: s.playerId, token: s.token, action }),
};
