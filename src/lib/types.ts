// Shared types used by both the server (API routes) and the client (React UI).

export type Category = "story" | "person" | "place" | "thing";
export type Difficulty = 1 | 2 | 3;

/** Word-bank slot kinds a sentence template can ask for. */
export type Slot = "adj" | "noun" | "person" | "place" | "verb" | "cat" | "guess";

export type Phase = "lobby" | "choosing" | "presenting" | "reveal" | "gameover";

export interface Prompt {
  id: string;
  answer: string;
  category: Category;
  /** The word that correctly finishes the opener "It's a ___ [kind]" (e.g. "movie"). */
  kind: string;
  difficulty: Difficulty;
  /** Prompt-specific words that actually help describe it. */
  words: Partial<Record<Exclude<Slot, "cat" | "guess">, string[]>>;
  /** Other accepted answers. */
  alts: string[];
}

export interface Template {
  id: string;
  /** Categories this template shows up for. */
  cats: Category[];
  /** e.g. "It's {a} [adj] [cat]." — `{a}` inserts a/an for the next blank. */
  pattern: string;
  /** UI grouping on the presenter's phone. */
  group: "start" | "describe" | "guess";
}

export interface Settings {
  rounds: 1 | 2 | 3;
  roundSeconds: number;
}

// ---------- Server-side room state (stored in Redis) ----------

export interface PlayerState {
  id: string;
  token: string;
  name: string;
  color: number;
  score: number;
  audience: boolean;
  left: boolean;
  joinedAt: number;
  lastSeen: number;
  lastGuessAt: number;
}

export interface Guess {
  id: number;
  pid: string;
  text: string;
  at: number;
  correct: boolean;
  close: boolean;
}

export interface Sentence {
  id: number;
  templateId: string;
  /** Rendered pieces; `word` pieces were chosen by the presenter. */
  parts: { t: string; w?: boolean }[];
  text: string;
  at: number;
}

export interface Solve {
  pid: string;
  at: number;
  points: number;
}

export interface RoundState {
  presenterId: string;
  options: string[]; // prompt ids offered to the presenter
  promptId: string | null;
  bank: Partial<Record<Slot, string[]>>;
  sentences: Sentence[];
  guesses: Guess[];
  solves: Solve[];
  startedAt: number;
  durationMs: number;
  endsAt: number;
  presenterPoints: number;
  nextId: number;
}

export interface TurnResult {
  presenterId: string;
  promptId: string;
  solved: number;
}

export interface RoomState {
  code: string;
  createdAt: number;
  hostId: string;
  players: PlayerState[];
  phase: Phase;
  phaseEndsAt: number;
  settings: Settings;
  turnOrder: string[];
  turnIndex: number;
  round: RoundState | null;
  usedPrompts: string[];
  history: TurnResult[];
  gameNumber: number;
}

// ---------- Personalised view sent to a device ----------

export interface PublicPlayer {
  id: string;
  name: string;
  color: number;
  score: number;
  audience: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface PublicGuess {
  id: number;
  pid: string;
  name: string;
  color: number;
  /** Hidden (null) for correct guesses unless you're allowed to see the answer. */
  text: string | null;
  correct: boolean;
  close: boolean;
  mine: boolean;
}

export interface PromptOption {
  id: string;
  answer: string;
  category: Category;
  difficulty: Difficulty;
}

export interface RoomView {
  code: string;
  now: number;
  me: { id: string; name: string; isHost: boolean; audience: boolean } | null;
  phase: Phase;
  phaseEndsAt: number;
  settings: Settings;
  players: PublicPlayer[];
  turn: { index: number; total: number; round: number; rounds: number; difficulty: Difficulty };
  presenterId: string | null;
  upNextId: string | null;
  // Round info (null in lobby / game over)
  round: null | {
    category: Category | null;
    kind: string | null;
    sentences: Sentence[];
    guesses: PublicGuess[];
    solvedIds: string[];
    hint: string | null;
    startedAt: number;
    endsAt: number;
    durationMs: number;
    /** The answer — only for the presenter, for people who solved it, and during reveal. */
    answer: string | null;
    solves: Solve[];
    presenterPoints: number;
    /** Presenter-only */
    options: PromptOption[] | null;
    bank: Partial<Record<Slot, string[]>> | null;
    templates: Template[] | null;
  };
}
