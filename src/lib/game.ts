import {
  GENERIC,
  KINDS,
  PROMPTS,
  PROMPT_MAP,
  TEMPLATE_MAP,
  TEMPLATES,
  article,
  parseTemplate,
} from "./content";
import { hintPattern, isClose, isCorrect, normalize } from "./matching";
import type {
  Category,
  Difficulty,
  Guess,
  PlayerState,
  Prompt,
  RoomState,
  RoomView,
  RoundState,
  Sentence,
  Settings,
  Slot,
} from "./types";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const CHOOSE_MS = 30_000;
export const REVEAL_MS = 12_000;
export const AFTER_FIRST_SOLVE_MS = 20_000;
export const CONNECTED_MS = 15_000;
export const HOST_TIMEOUT_MS = 45_000;
const BANK_SIZE = 12;
const MAX_RELEVANT = 5;
const MAX_GUESSES_KEPT = 80;
const MAX_SENTENCES = 40;
const GUESS_COOLDOWN_MS = 700;
const SENTENCE_COOLDOWN_MS = 1200;

export class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const DEFAULT_SETTINGS: Settings = { rounds: 2, roundSeconds: 120 };

// ---------------------------------------------------------------- helpers

function rid(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (const b of bytes) s += chars[b % chars.length];
  return s;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const round10 = (n: number) => Math.round(n / 10) * 10;

export function cleanName(raw: unknown): string {
  if (typeof raw !== "string") throw new GameError("Enter a name");
  const name = raw
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12);
  if (!name) throw new GameError("Enter a name");
  return name;
}

const activePlayers = (s: RoomState) => s.players.filter((p) => !p.left && !p.audience);
const getPlayer = (s: RoomState, pid: string) => s.players.find((p) => p.id === pid);

function freeColor(s: RoomState): number {
  const used = new Set(s.players.filter((p) => !p.left).map((p) => p.color));
  for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
  return Math.floor(Math.random() * MAX_PLAYERS);
}

export function answersFor(p: Prompt): string[] {
  return [p.answer, ...p.alts];
}

// ---------------------------------------------------------------- room lifecycle

export function newRoom(code: string, hostName: string, now: number): { state: RoomState; player: PlayerState } {
  const player: PlayerState = {
    id: rid(),
    token: rid(24),
    name: cleanName(hostName),
    color: 0,
    score: 0,
    audience: false,
    left: false,
    joinedAt: now,
    lastSeen: now,
    lastGuessAt: 0,
  };
  const state: RoomState = {
    code,
    createdAt: now,
    hostId: player.id,
    players: [player],
    phase: "lobby",
    phaseEndsAt: 0,
    settings: { ...DEFAULT_SETTINGS },
    turnOrder: [],
    turnIndex: 0,
    round: null,
    usedPrompts: [],
    history: [],
    gameNumber: 0,
  };
  return { state, player };
}

/** Join or re-join. Returns the player record. */
export function joinRoom(
  s: RoomState,
  rawName: unknown,
  now: number,
  rejoin?: { playerId?: string; token?: string },
): PlayerState {
  if (rejoin?.playerId && rejoin.token) {
    const existing = getPlayer(s, rejoin.playerId);
    if (existing && existing.token === rejoin.token) {
      existing.lastSeen = now;
      if (existing.left) {
        existing.left = false;
        // Re-joining mid-game: only get your seat back if you were in this game's turn order.
        if (s.phase !== "lobby" && !s.turnOrder.includes(existing.id)) existing.audience = true;
      }
      return existing;
    }
  }
  const name = cleanName(rawName);
  const taken = s.players.some((p) => !p.left && p.name.toLowerCase() === name.toLowerCase());
  if (taken) throw new GameError("Someone in this room already has that name");
  if (s.players.filter((p) => !p.left).length >= 30) throw new GameError("This room is full");

  const audience = s.phase !== "lobby" || activePlayers(s).length >= MAX_PLAYERS;
  const player: PlayerState = {
    id: rid(),
    token: rid(24),
    name,
    color: freeColor(s),
    score: 0,
    audience,
    left: false,
    joinedAt: now,
    lastSeen: now,
    lastGuessAt: 0,
  };
  s.players.push(player);
  return player;
}

// ---------------------------------------------------------------- turns

function turnInfo(s: RoomState) {
  const perRound = Math.max(1, s.turnOrder.length / Math.max(1, s.settings.rounds));
  const roundNo = Math.min(s.settings.rounds, Math.floor(s.turnIndex / perRound) + 1);
  const difficulty = Math.min(3, roundNo) as Difficulty;
  return { roundNo, difficulty };
}

function pickOptions(s: RoomState, difficulty: Difficulty): string[] {
  const used = new Set(s.usedPrompts);
  const usedAnswers = new Set(s.usedPrompts.map((id) => normalize(PROMPT_MAP[id]?.answer ?? "")));
  const fresh = (p: Prompt) => !used.has(p.id) && !usedAnswers.has(normalize(p.answer));

  let pool = PROMPTS.filter((p) => p.difficulty === difficulty && fresh(p));
  if (pool.length < 3) pool = PROMPTS.filter(fresh);
  if (pool.length < 3) {
    // Every prompt has been played in this room — start recycling.
    s.usedPrompts = [];
    pool = PROMPTS.filter((p) => p.difficulty === difficulty);
  }

  // Prefer three different categories.
  const picks: Prompt[] = [];
  const cats = shuffle<Category>(["story", "person", "place", "thing"]);
  for (const c of cats) {
    if (picks.length >= 3) break;
    const inCat = shuffle(pool.filter((p) => p.category === c));
    if (inCat.length) picks.push(inCat[0]);
  }
  for (const p of shuffle(pool)) {
    if (picks.length >= 3) break;
    if (!picks.includes(p)) picks.push(p);
  }
  return picks.map((p) => p.id);
}

function buildBank(prompt: Prompt): RoundState["bank"] {
  const answers = answersFor(prompt);
  const leaks = (w: string) => isCorrect(w, answers) || isClose(w, answers);
  const bank: RoundState["bank"] = {};
  for (const slot of ["adj", "noun", "person", "place", "verb"] as const) {
    const relevant = shuffle(prompt.words[slot] ?? [])
      .filter((w) => !leaks(w))
      .slice(0, MAX_RELEVANT);
    const seen = new Set(relevant.map((w) => w.toLowerCase()));
    const filler: string[] = [];
    for (const w of shuffle(GENERIC[slot])) {
      if (relevant.length + filler.length >= BANK_SIZE) break;
      if (seen.has(w.toLowerCase()) || leaks(w)) continue;
      seen.add(w.toLowerCase());
      filler.push(w);
    }
    bank[slot] = shuffle([...relevant, ...filler]);
  }
  const kinds = KINDS[prompt.category];
  bank.cat = shuffle(kinds.includes(prompt.kind) ? kinds : [prompt.kind, ...kinds]);
  return bank;
}

function startTurn(s: RoomState, now: number) {
  // Skip presenters who have left.
  while (s.turnIndex < s.turnOrder.length) {
    const p = getPlayer(s, s.turnOrder[s.turnIndex]);
    if (p && !p.left) break;
    s.turnIndex++;
  }
  if (s.turnIndex >= s.turnOrder.length || activePlayers(s).length < MIN_PLAYERS) {
    s.phase = "gameover";
    s.phaseEndsAt = 0;
    s.round = null;
    return;
  }
  const { difficulty } = turnInfo(s);
  s.round = {
    presenterId: s.turnOrder[s.turnIndex],
    options: pickOptions(s, difficulty),
    promptId: null,
    bank: {},
    sentences: [],
    guesses: [],
    solves: [],
    startedAt: 0,
    durationMs: s.settings.roundSeconds * 1000,
    endsAt: 0,
    presenterPoints: 0,
    nextId: 1,
  };
  s.phase = "choosing";
  s.phaseEndsAt = now + CHOOSE_MS;
}

function choosePrompt(s: RoomState, promptId: string, now: number) {
  const r = s.round!;
  const prompt = PROMPT_MAP[promptId];
  if (!prompt || !r.options.includes(promptId)) throw new GameError("Pick one of your options");
  r.promptId = promptId;
  r.bank = buildBank(prompt);
  r.startedAt = now;
  r.durationMs = s.settings.roundSeconds * 1000;
  r.endsAt = now + r.durationMs;
  s.usedPrompts.push(promptId);
  s.phase = "presenting";
  s.phaseEndsAt = r.endsAt;
}

function eligibleGuessers(s: RoomState) {
  const r = s.round!;
  return activePlayers(s).filter((p) => p.id !== r.presenterId);
}

function endTurn(s: RoomState, now: number) {
  const r = s.round;
  if (r?.promptId) {
    s.history.push({
      presenterId: r.presenterId,
      promptId: r.promptId,
      solved: r.solves.filter((x) => x.points > 0).length,
    });
  }
  s.phase = "reveal";
  s.phaseEndsAt = now + REVEAL_MS;
}

function nextTurn(s: RoomState, now: number) {
  s.turnIndex++;
  startTurn(s, now);
}

/** Apply time-based transitions. Returns true if the state changed. */
export function advance(s: RoomState, now: number): boolean {
  let changed = false;

  // Host hand-off if the host vanished.
  const host = getPlayer(s, s.hostId);
  if (!host || host.left || now - host.lastSeen > HOST_TIMEOUT_MS) {
    const candidates = s.players
      .filter((p) => !p.left && p.id !== s.hostId && now - p.lastSeen < CONNECTED_MS)
      .sort((a, b) => Number(a.audience) - Number(b.audience) || a.joinedAt - b.joinedAt);
    if (candidates[0]) {
      s.hostId = candidates[0].id;
      changed = true;
    }
  }

  for (let guard = 0; guard < 5; guard++) {
    if (s.phase === "choosing" && now >= s.phaseEndsAt && s.round) {
      choosePrompt(s, s.round.options[0], now);
    } else if (s.phase === "presenting" && now >= s.phaseEndsAt) {
      endTurn(s, now);
    } else if (s.phase === "reveal" && now >= s.phaseEndsAt) {
      nextTurn(s, now);
    } else break;
    changed = true;
  }
  return changed;
}

// ---------------------------------------------------------------- actions

export type Action =
  | { type: "ping" }
  | { type: "settings"; rounds?: number; roundSeconds?: number }
  | { type: "start" }
  | { type: "choose"; promptId: string }
  | { type: "sentence"; templateId: string; words: string[] }
  | { type: "guess"; text: string }
  | { type: "skip" }
  | { type: "kick"; target: string }
  | { type: "leave" }
  | { type: "playAgain" }
  | { type: "endGame" };

export function applyAction(s: RoomState, pid: string, a: Action, now: number): void {
  const me = getPlayer(s, pid);
  if (!me) throw new GameError("You're not in this room", 403);
  me.lastSeen = now;
  const isHost = s.hostId === pid;
  const requireHost = () => {
    if (!isHost) throw new GameError("Only the host can do that", 403);
  };

  switch (a.type) {
    case "ping":
      return;

    case "settings": {
      requireHost();
      if (s.phase !== "lobby") throw new GameError("Game already started");
      if (a.rounds !== undefined) {
        if (![1, 2, 3].includes(a.rounds)) throw new GameError("Bad rounds");
        s.settings.rounds = a.rounds as Settings["rounds"];
      }
      if (a.roundSeconds !== undefined) {
        if (![60, 90, 120, 150, 180].includes(a.roundSeconds)) throw new GameError("Bad timer");
        s.settings.roundSeconds = a.roundSeconds;
      }
      return;
    }

    case "start": {
      requireHost();
      if (s.phase !== "lobby") throw new GameError("Game already started");
      // Promote audience members into free seats.
      for (const p of s.players) {
        if (!p.left && p.audience && activePlayers(s).length < MAX_PLAYERS) p.audience = false;
      }
      const players = activePlayers(s);
      if (players.length < MIN_PLAYERS) throw new GameError(`Need at least ${MIN_PLAYERS} players`);
      const order = shuffle(players.map((p) => p.id));
      s.turnOrder = [];
      for (let r = 0; r < s.settings.rounds; r++) s.turnOrder.push(...order);
      s.turnIndex = 0;
      s.history = [];
      s.gameNumber++;
      for (const p of s.players) p.score = 0;
      startTurn(s, now);
      return;
    }

    case "choose": {
      if (s.phase !== "choosing" || !s.round) throw new GameError("Not choosing right now");
      if (s.round.presenterId !== pid) throw new GameError("It's not your turn", 403);
      choosePrompt(s, a.promptId, now);
      return;
    }

    case "sentence": {
      const r = s.round;
      if (s.phase !== "presenting" || !r?.promptId) throw new GameError("Round isn't running");
      if (r.presenterId !== pid) throw new GameError("Only the presenter can do that", 403);
      const prompt = PROMPT_MAP[r.promptId];
      const tpl = TEMPLATE_MAP[a.templateId];
      if (!tpl || !tpl.cats.includes(prompt.category)) throw new GameError("Unknown sentence");
      if (r.sentences.length === 0 && tpl.id !== "open") throw new GameError("Start with the opening sentence");
      if (r.sentences.length > 0 && tpl.id === "open") throw new GameError("You already used the opener");
      if (r.sentences.length >= MAX_SENTENCES) throw new GameError("That's enough blathering!");
      const last = r.sentences[r.sentences.length - 1];
      if (last && now - last.at < SENTENCE_COOLDOWN_MS) throw new GameError("Slow down!");

      const tokens = parseTemplate(tpl.pattern);
      const blanks = tokens.filter((t) => t.kind === "blank");
      if (!Array.isArray(a.words) || a.words.length !== blanks.length) throw new GameError("Fill every blank");
      const guessTexts = new Set(r.guesses.filter((g) => !g.correct).map((g) => g.text));

      const parts: Sentence["parts"] = [];
      let bi = 0;
      for (let ti = 0; ti < tokens.length; ti++) {
        const tok = tokens[ti];
        if (tok.kind === "text") {
          parts.push({ t: tok.text });
          continue;
        }
        const word = String(a.words[bi++] ?? "");
        const allowed = tok.slot === "guess" ? guessTexts.has(word) : (r.bank[tok.slot] ?? []).includes(word);
        if (!allowed) throw new GameError("That word isn't available");
        if (tok.article) {
          // Article agrees with the first word of what follows (the adjective, in "It's {a} [adj] [cat]").
          parts.push({ t: article(word) + " " });
        }
        parts.push({ t: tok.slot === "guess" ? `"${word}"` : word, w: true });
      }
      // Capitalise the first letter of the sentence.
      const first = parts.find((p) => p.t.trim().length);
      if (first) first.t = first.t.replace(/^(\s*"?)([a-z])/, (_, pre, c) => pre + c.toUpperCase());
      const text = parts.map((p) => p.t).join("");
      r.sentences.push({ id: r.nextId++, templateId: tpl.id, parts, text, at: now });
      return;
    }

    case "guess": {
      const r = s.round;
      if (s.phase !== "presenting" || !r?.promptId) throw new GameError("Round isn't running");
      if (r.presenterId === pid) throw new GameError("You're the presenter!");
      if (r.solves.some((x) => x.pid === pid)) throw new GameError("You already got it!");
      const text = String(a.text ?? "")
        .replace(/[\u0000-\u001f\u007f<>]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40);
      if (!text) throw new GameError("Type a guess");
      if (now - me.lastGuessAt < GUESS_COOLDOWN_MS) throw new GameError("Slow down!");
      me.lastGuessAt = now;

      const prompt = PROMPT_MAP[r.promptId];
      const answers = answersFor(prompt);
      const correct = isCorrect(text, answers);
      const close = !correct && isClose(text, answers);
      const g: Guess = { id: r.nextId++, pid, text, at: now, correct, close };
      r.guesses.push(g);
      if (r.guesses.length > MAX_GUESSES_KEPT) r.guesses.splice(0, r.guesses.length - MAX_GUESSES_KEPT);

      if (correct) {
        const scoring = !me.audience;
        const originalEnd = r.startedAt + r.durationMs;
        const frac = Math.max(0, Math.min(1, (originalEnd - now) / r.durationMs));
        const firstSolve = r.solves.filter((x) => x.points > 0).length === 0;
        let points = 0;
        if (scoring) {
          points = round10(300 + 700 * frac) + (firstSolve ? 100 : 0);
          me.score += points;
          const presenter = getPlayer(s, r.presenterId);
          const pp = firstSolve ? round10(200 + 500 * frac) : 100;
          r.presenterPoints += pp;
          if (presenter) presenter.score += pp;
        }
        r.solves.push({ pid, at: now, points });

        if (scoring && firstSolve) {
          r.endsAt = Math.min(r.endsAt, now + AFTER_FIRST_SOLVE_MS);
          s.phaseEndsAt = r.endsAt;
        }
        const solvedIds = new Set(r.solves.map((x) => x.pid));
        const remaining = eligibleGuessers(s).filter((p) => !solvedIds.has(p.id));
        if (remaining.length === 0) endTurn(s, now);
      }
      return;
    }

    case "skip": {
      requireHost();
      if (s.phase === "choosing" || s.phase === "presenting") endTurn(s, now);
      else if (s.phase === "reveal") nextTurn(s, now);
      return;
    }

    case "kick": {
      requireHost();
      const target = getPlayer(s, a.target);
      if (!target || target.id === pid) throw new GameError("Can't kick that player");
      removePlayer(s, target, now);
      target.token = rid(24); // invalidate their session
      return;
    }

    case "leave": {
      removePlayer(s, me, now);
      return;
    }

    case "playAgain": {
      requireHost();
      if (s.phase !== "gameover") throw new GameError("Game isn't over");
      s.players = s.players.filter((p) => !p.left);
      for (const p of s.players) {
        p.score = 0;
        if (p.audience && activePlayers(s).length < MAX_PLAYERS) p.audience = false;
      }
      s.phase = "lobby";
      s.round = null;
      s.turnOrder = [];
      s.turnIndex = 0;
      s.history = [];
      return;
    }

    case "endGame": {
      requireHost();
      if (s.phase === "lobby") return;
      s.phase = "gameover";
      s.round = null;
      s.phaseEndsAt = 0;
      return;
    }

    default:
      throw new GameError("Unknown action");
  }
}

function removePlayer(s: RoomState, p: PlayerState, now: number) {
  if (s.phase === "lobby") {
    s.players = s.players.filter((x) => x.id !== p.id);
  } else {
    p.left = true;
    if (s.round?.presenterId === p.id && (s.phase === "choosing" || s.phase === "presenting")) {
      endTurn(s, now);
    } else if (s.phase === "presenting" && s.round) {
      const solved = new Set(s.round.solves.map((x) => x.pid));
      if (eligibleGuessers(s).every((x) => solved.has(x.id)) && s.round.solves.length > 0) endTurn(s, now);
    }
    if (activePlayers(s).length < MIN_PLAYERS && s.phase !== "gameover") {
      s.phase = "gameover";
      s.round = null;
    }
  }
  if (s.hostId === p.id) {
    const next = s.players
      .filter((x) => !x.left && x.id !== p.id)
      .sort((a, b) => Number(a.audience) - Number(b.audience) || b.lastSeen - a.lastSeen)[0];
    if (next) s.hostId = next.id;
  }
}

// ---------------------------------------------------------------- views

export function viewFor(s: RoomState, pid: string | null, now: number): RoomView {
  const me = pid ? getPlayer(s, pid) : undefined;
  const r = s.round;
  const prompt = r?.promptId ? PROMPT_MAP[r.promptId] : null;
  const isPresenter = !!me && r?.presenterId === me.id;
  const solvedIds = r ? r.solves.map((x) => x.pid) : [];
  const iSolved = !!me && solvedIds.includes(me.id);
  const canSeeAnswer = isPresenter || iSolved || s.phase === "reveal";
  const nameOf = (id: string) => getPlayer(s, id);
  const { roundNo, difficulty } = turnInfo(s);

  let upNextId: string | null = null;
  for (let i = s.turnIndex + 1; i < s.turnOrder.length; i++) {
    const p = getPlayer(s, s.turnOrder[i]);
    if (p && !p.left) {
      upNextId = p.id;
      break;
    }
  }

  let hint: string | null = null;
  if (s.phase === "presenting" && prompt && r) {
    const elapsed = (now - r.startedAt) / r.durationMs;
    const display = prompt.answer.replace(/^(a|an) /i, "");
    if (elapsed >= 0.75) hint = hintPattern(display, true);
    else if (elapsed >= 0.45) hint = hintPattern(display, false);
  }

  const templates =
    isPresenter && prompt && r
      ? TEMPLATES.filter(
          (t) => t.cats.includes(prompt.category) && (r.sentences.length === 0 ? t.id === "open" : t.id !== "open"),
        ).sort((a, b) => Number(a.cats.length > 1) - Number(b.cats.length > 1)) // category-specific first
      : null;

  return {
    code: s.code,
    now,
    me: me
      ? { id: me.id, name: me.name, isHost: s.hostId === me.id, audience: me.audience }
      : null,
    phase: s.phase,
    phaseEndsAt: s.phaseEndsAt,
    settings: s.settings,
    players: s.players
      .filter((p) => !p.left)
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        score: p.score,
        audience: p.audience,
        connected: now - p.lastSeen < CONNECTED_MS,
        isHost: p.id === s.hostId,
      })),
    turn: {
      index: s.turnIndex,
      total: s.turnOrder.length,
      round: roundNo,
      rounds: s.settings.rounds,
      difficulty,
    },
    presenterId: r?.presenterId ?? null,
    upNextId,
    round: r
      ? {
          category: prompt?.category ?? null,
          kind: s.phase === "reveal" ? (prompt?.kind ?? null) : null,
          sentences: r.sentences,
          guesses: r.guesses.map((g) => {
            const p = nameOf(g.pid);
            return {
              id: g.id,
              pid: g.pid,
              name: p?.name ?? "?",
              color: p?.color ?? 0,
              text: g.correct && !canSeeAnswer && g.pid !== pid ? null : g.text,
              correct: g.correct,
              close: g.close && (g.pid === pid || isPresenter),
              mine: g.pid === pid,
            };
          }),
          solvedIds,
          hint,
          startedAt: r.startedAt,
          endsAt: r.endsAt,
          durationMs: r.durationMs,
          answer: canSeeAnswer && prompt ? prompt.answer : null,
          solves: r.solves,
          presenterPoints: r.presenterPoints,
          options:
            isPresenter && s.phase === "choosing"
              ? r.options.map((id) => {
                  const p = PROMPT_MAP[id];
                  return { id, answer: p.answer, category: p.category, difficulty: p.difficulty };
                })
              : null,
          bank: isPresenter && s.phase === "presenting" ? r.bank : null,
          templates,
        }
      : null,
  };
}

export type { Slot };
