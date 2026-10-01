// Room storage.
//  • Production (Vercel): Upstash Redis over its REST API. Add the free
//    "Upstash for Redis" integration from the Vercel Marketplace and it sets
//    KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / _TOKEN).
//  • Local dev without those variables: an in-memory map (single process only).
//
// Writes use optimistic concurrency: every room has a version number and a
// small Lua script only saves if the version hasn't changed since we read it.

import type { RoomState } from "./types";

const TTL_SECONDS = 60 * 60 * 6; // rooms expire 6h after their last change

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
export const usingRedis = Boolean(URL_ && TOKEN);

if (!usingRedis && process.env.VERCEL) {
  console.error(
    "[blabber] No Redis configured! Add Upstash for Redis from the Vercel Marketplace. " +
      "Falling back to in-memory storage, which will NOT work across serverless instances.",
  );
}

export interface Stored {
  state: RoomState;
  version: number;
}

interface Backend {
  get(code: string): Promise<Stored | null>;
  /** Save only if the current version equals `expected` (0 = must not exist). */
  cas(code: string, expected: number, state: RoomState): Promise<boolean>;
}

// ---------------------------------------------------------------- Upstash REST

async function redis<T = unknown>(command: (string | number)[]): Promise<T> {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const json = (await res.json()) as { result?: T; error?: string };
  if (!res.ok || json.error) throw new Error(`Redis error: ${json.error ?? res.status}`);
  return json.result as T;
}

const CAS_SCRIPT = `
local cur = redis.call('GET', KEYS[2])
if (cur == false and ARGV[1] == '0') or cur == ARGV[1] then
  local nv = tonumber(ARGV[1]) + 1
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  redis.call('SET', KEYS[2], tostring(nv), 'EX', ARGV[3])
  return nv
end
return 0
`;

const stateKey = (c: string) => `blabber:room:${c}`;
const verKey = (c: string) => `blabber:ver:${c}`;

const redisBackend: Backend = {
  async get(code) {
    const [raw, ver] = await redis<(string | null)[]>(["MGET", stateKey(code), verKey(code)]);
    if (!raw) return null;
    return { state: JSON.parse(raw) as RoomState, version: Number(ver ?? 0) };
  },
  async cas(code, expected, state) {
    const result = await redis<number>([
      "EVAL",
      CAS_SCRIPT,
      "2",
      stateKey(code),
      verKey(code),
      String(expected),
      JSON.stringify(state),
      String(TTL_SECONDS),
    ]);
    return Number(result) > 0;
  },
};

// ---------------------------------------------------------------- In-memory

const g = globalThis as unknown as { __blabberRooms?: Map<string, { json: string; version: number; exp: number }> };
const mem = (g.__blabberRooms ??= new Map());

const memoryBackend: Backend = {
  async get(code) {
    const row = mem.get(code);
    if (!row || row.exp < Date.now()) return null;
    return { state: JSON.parse(row.json) as RoomState, version: row.version };
  },
  async cas(code, expected, state) {
    const row = mem.get(code);
    const cur = row && row.exp >= Date.now() ? row.version : 0;
    if (cur !== expected) return false;
    mem.set(code, { json: JSON.stringify(state), version: cur + 1, exp: Date.now() + TTL_SECONDS * 1000 });
    return true;
  },
};

const backend: Backend = usingRedis ? redisBackend : memoryBackend;

// ---------------------------------------------------------------- Public API

export async function loadRoom(code: string): Promise<Stored | null> {
  return backend.get(code);
}

/**
 * Read-modify-write with retries. `fn` mutates the state in place and returns
 * a value; return `false` from `shouldSave` to skip writing.
 */
export async function updateRoom<T>(
  code: string,
  fn: (state: RoomState) => T,
  opts: { shouldSave?: (result: T) => boolean } = {},
): Promise<{ state: RoomState; result: T } | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const cur = await backend.get(code);
    if (!cur) return null;
    const result = fn(cur.state);
    if (opts.shouldSave && !opts.shouldSave(result)) return { state: cur.state, result };
    if (await backend.cas(code, cur.version, cur.state)) return { state: cur.state, result };
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 40 * (attempt + 1)));
  }
  throw new Error("Room is busy, try again");
}

/** Create a room with a fresh 4-letter code. */
export async function createRoom(make: (code: string) => RoomState): Promise<RoomState> {
  // Consonants only, so codes never spell anything rude.
  const letters = "BCDFGHJKLMNPQRSTVWXZ";
  for (let attempt = 0; attempt < 30; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const code = Array.from(bytes, (b) => letters[b % letters.length]).join("");
    const state = make(code);
    if (await backend.cas(code, 0, state)) return state;
  }
  throw new Error("Couldn't find a free room code");
}
