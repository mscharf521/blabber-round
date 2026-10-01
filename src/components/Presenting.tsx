"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_ICON, CATEGORY_LABEL, article, parseTemplate } from "@/lib/templates";
import type { Action } from "@/lib/game";
import type { RoomView, Sentence, Slot, Template } from "@/lib/types";
import { PlayerStrip, colorOf, nameOf } from "./ui";

type Act = (a: Action) => Promise<unknown>;

// ------------------------------------------------------------------ shared bits

function SentenceLine({ s, latest }: { s: Sentence; latest?: boolean }) {
  return (
    <div className={`sentence${latest ? " latest" : ""}`}>
      {s.parts.map((p, i) =>
        p.w ? (
          <span key={i} className="w">
            {p.t}
          </span>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </div>
  );
}

function Board({ view }: { view: RoomView }) {
  const sentences = view.round?.sentences ?? [];
  const presenter = nameOf(view, view.presenterId);
  const newestFirst = [...sentences].reverse();
  return (
    <div className="board" aria-live="polite">
      {newestFirst.length === 0 ? (
        <div className="empty">{presenter} is building the first sentence…</div>
      ) : (
        newestFirst.map((s, i) => <SentenceLine key={s.id} s={s} latest={i === 0} />)
      )}
    </div>
  );
}

function CategoryBar({ view }: { view: RoomView }) {
  const cat = view.round?.category;
  return (
    <div className="catbar">
      {cat ? (
        <span className="catpill">
          {CATEGORY_ICON[cat]} {CATEGORY_LABEL[cat]}
        </span>
      ) : (
        <span />
      )}
      <span className="presenter-label">🎤 {nameOf(view, view.presenterId)}</span>
    </div>
  );
}

function GuessWall({
  view,
  onPick,
}: {
  view: RoomView;
  /** Presenter: tap a guess to use it in a sentence. */
  onPick?: (text: string) => void;
}) {
  const guesses = [...(view.round?.guesses ?? [])].reverse().slice(0, 50);
  if (!guesses.length) {
    return <p style={{ margin: 0, color: "rgba(255,255,255,.5)", fontSize: 15 }}>No guesses yet.</p>;
  }
  return (
    <div className="guesses">
      {guesses.map((g) => {
        const pickable = !!onPick && !g.correct && !!g.text;
        return (
          <span
            key={g.id}
            className={`guess${g.correct ? " correct" : ""}${g.close ? " close" : ""}${g.mine ? " mine" : ""}${
              pickable ? " pickable" : ""
            }`}
            title={g.name}
            role={pickable ? "button" : undefined}
            tabIndex={pickable ? 0 : undefined}
            onClick={pickable ? () => onPick!(g.text!) : undefined}
          >
            <span className="dot" style={{ background: colorOf(g.color) }}>
              {g.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="gt">
              {g.correct ? (g.text ? `✓ ${g.text}` : `✓ ${g.name} got it!`) : g.text}
            </span>
            {pickable && <span style={{ fontWeight: 700, color: "var(--pink)" }}>＋</span>}
          </span>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ guesser

export function GuesserView({ view, act }: { view: RoomView; act: Act }) {
  const round = view.round!;
  const me = view.me!;
  const solved = round.solvedIds.includes(me.id);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "close" | "wrong"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fbTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const guess = text.trim();
    if (!guess || sending) return;
    setSending(true);
    try {
      const v = (await act({ type: "guess", text: guess })) as RoomView | undefined;
      setText("");
      const mine = v?.round?.guesses.filter((g) => g.mine).pop();
      if (mine && !mine.correct) {
        setFeedback(mine.close ? { kind: "close", text: `"${guess}" is close!` } : { kind: "wrong", text: "Nope!" });
        clearTimeout(fbTimer.current);
        fbTimer.current = setTimeout(() => setFeedback(null), 2200);
      }
    } catch {
      /* toast shown by parent */
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <>
      <PlayerStrip view={view} />
      <CategoryBar view={view} />
      {round.hint && !solved && <div className="hint">{round.hint}</div>}
      {solved && (
        <div className="solved-banner">
          🎉 You got it!
          <span className="ans">{round.answer}</span>
        </div>
      )}
      {me.audience && !solved && (
        <p className="center" style={{ margin: 0, color: "rgba(255,255,255,.6)", fontSize: 14 }}>
          You&apos;re in the audience. Guess along for fun!
        </p>
      )}
      <Board view={view} />
      <div className="sectiontitle">Guesses</div>
      <GuessWall view={view} />
      <div style={{ flex: 1 }} />
      {!solved && (
        <div className="guessbar">
          {feedback && <div className={`feedback ${feedback.kind}`}>{feedback.text}</div>}
          <form onSubmit={submit}>
            <input
              ref={inputRef}
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 40))}
              placeholder="Type your guess…"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              maxLength={40}
            />
            <button className="btn teal" type="submit" disabled={!text.trim() || sending}>
              Guess
            </button>
          </form>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ presenter

function TemplatePreview({ t }: { t: Template }) {
  const tokens = parseTemplate(t.pattern);
  return (
    <>
      {tokens.map((tok, i) =>
        tok.kind === "text" ? (
          <span key={i}>{tok.text}</span>
        ) : (
          <span key={i}>
            {tok.article ? "a " : ""}
            <span className="blank" />
          </span>
        ),
      )}
    </>
  );
}

const SLOT_LABEL: Record<Slot, string> = {
  adj: "describe",
  noun: "thing",
  person: "who",
  place: "where",
  verb: "action",
  cat: "type",
  guess: "a guess",
};

function Composer({ view, act, pickedGuess }: { view: RoomView; act: Act; pickedGuess: string | null }) {
  const round = view.round!;
  const templates = round.templates ?? [];
  const bank = round.bank ?? {};
  const [tplId, setTplId] = useState<string | null>(null);
  const [words, setWords] = useState<(string | null)[]>([]);
  const [active, setActive] = useState(0);
  const [sending, setSending] = useState(false);

  const tpl = templates.find((t) => t.id === tplId) ?? null;
  const tokens = useMemo(() => (tpl ? parseTemplate(tpl.pattern) : []), [tpl]);
  const blanks = tokens.filter((t) => t.kind === "blank") as Extract<ReturnType<typeof parseTemplate>[number], { kind: "blank" }>[];

  // Wrong guesses the presenter can reference (newest first, unique).
  const guessOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const g of [...round.guesses].reverse()) {
      if (g.correct || !g.text) continue;
      const k = g.text.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(g.text);
      if (out.length >= 16) break;
    }
    return out;
  }, [round.guesses]);

  // Tapping "+" on a guess starts the "It's like ___" sentence with it.
  const lastPicked = useRef<string | null>(null);
  useEffect(() => {
    if (!pickedGuess || pickedGuess === lastPicked.current) return;
    lastPicked.current = pickedGuess;
    const t = templates.find((x) => x.id === "g_like");
    if (!t) return;
    const n = parseTemplate(t.pattern).filter((x) => x.kind === "blank").length;
    const w: (string | null)[] = Array(n).fill(null);
    w[0] = pickedGuess.split("\u0000")[0];
    setTplId(t.id);
    setWords(w);
    setActive(1 < n ? 1 : 0);
  }, [pickedGuess, templates]);

  function choose(t: Template) {
    const n = parseTemplate(t.pattern).filter((x) => x.kind === "blank").length;
    setTplId(t.id);
    setWords(Array(n).fill(null));
    setActive(0);
  }

  function reset() {
    setTplId(null);
    setWords([]);
    setActive(0);
  }

  function pickWord(w: string) {
    const next = [...words];
    next[active] = w;
    setWords(next);
    const nextEmpty = next.findIndex((x) => x === null);
    if (nextEmpty >= 0) setActive(nextEmpty);
  }

  async function send() {
    if (!tpl || words.some((w) => !w) || sending) return;
    setSending(true);
    try {
      await act({ type: "sentence", templateId: tpl.id, words: words as string[] });
      reset();
    } catch {
      /* toast shown by parent */
    } finally {
      setSending(false);
    }
  }

  if (!tpl) {
    const first = round.sentences.length === 0;
    const describe = templates.filter((t) => t.group !== "guess");
    const guessy = templates.filter((t) => t.group === "guess");
    return (
      <div className="card">
        <div className="sectiontitle">{first ? "Start with the opener" : "Pick a sentence"}</div>
        <div className="tpl-list">
          {describe.map((t) => (
            <button key={t.id} className="tpl" onClick={() => choose(t)}>
              <TemplatePreview t={t} />
            </button>
          ))}
        </div>
        {!first && guessy.length > 0 && (
          <>
            <div className="sectiontitle" style={{ marginTop: 14 }}>
              React to a guess {guessOptions.length === 0 && "(once someone guesses)"}
            </div>
            <div className="tpl-list">
              {guessy.map((t) => (
                <button
                  key={t.id}
                  className="tpl guessy"
                  disabled={guessOptions.length === 0}
                  onClick={() => choose(t)}
                >
                  <TemplatePreview t={t} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const activeSlot = blanks[active]?.slot;
  const choices = activeSlot === "guess" ? guessOptions : (bank[activeSlot] ?? []);
  let bi = -1;

  return (
    <div className="card">
      <div className="compose">
        {tokens.map((tok, i) => {
          if (tok.kind === "text") return <span key={i}>{tok.text}</span>;
          bi++;
          const idx = bi;
          const w = words[idx];
          return (
            <span key={i}>
              {tok.article && <span>{w ? article(w) : "a"} </span>}
              <button
                className={`slotbtn${w ? " filled" : ""}${idx === active ? " active" : ""}`}
                onClick={() => setActive(idx)}
              >
                {w ? (tok.slot === "guess" ? `"${w}"` : w) : SLOT_LABEL[tok.slot]}
              </button>
            </span>
          );
        })}
      </div>
      <div className="sectiontitle">Choose {SLOT_LABEL[activeSlot] ?? "a word"}</div>
      <div className="words">
        {choices.map((w) => (
          <button key={w} className={`word${words[active] === w ? " sel" : ""}`} onClick={() => pickWord(w)}>
            {w}
          </button>
        ))}
        {choices.length === 0 && <p className="muted">No guesses to use yet.</p>}
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn ghost" onClick={reset}>
          ← Back
        </button>
        <button className="btn" disabled={words.some((w) => !w) || sending} onClick={send}>
          {sending ? "Sending…" : "Send it!"}
        </button>
      </div>
    </div>
  );
}

export function PresenterView({ view, act }: { view: RoomView; act: Act }) {
  const round = view.round!;
  const [picked, setPicked] = useState<string | null>(null);
  const pickCounter = useRef(0);
  const composerRef = useRef<HTMLDivElement>(null);
  const cat = round.category;

  return (
    <>
      <PlayerStrip view={view} />
      <div className="secret">
        <div>
          <div className="k">Your secret {cat ? `· ${CATEGORY_LABEL[cat]}` : ""}</div>
          <div className="v">{round.answer}</div>
        </div>
        <span style={{ fontSize: 30 }}>{cat ? CATEGORY_ICON[cat] : ""}</span>
      </div>
      {round.hint && (
        <div className="hint" title="Hint the guessers can see">
          {round.hint}
        </div>
      )}
      <div ref={composerRef}>
        <Composer view={view} act={act} pickedGuess={picked} />
      </div>
      <div className="sectiontitle">Guesses (tap ＋ to use one)</div>
      <GuessWall
        view={view}
        onPick={(t) => {
          pickCounter.current++;
          setPicked(`${t}\u0000${pickCounter.current}`);
          composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
      <div className="sectiontitle">What you&apos;ve said</div>
      <Board view={view} />
    </>
  );
}
