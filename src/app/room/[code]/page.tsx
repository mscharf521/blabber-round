"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api, clearSession, getSession, type Session } from "@/lib/client";
import type { Action } from "@/lib/game";
import type { RoomView } from "@/lib/types";
import { Lobby } from "@/components/Lobby";
import { Choosing } from "@/components/Choosing";
import { GuesserView, PresenterView } from "@/components/Presenting";
import { GameOver, Reveal } from "@/components/Results";
import { Timer } from "@/components/ui";

const TTS_KEY = "blabber:tts";

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<RoomView | null>(null);
  const [fatal, setFatal] = useState("");
  const [toast, setToast] = useState<{ text: string; info?: boolean } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tts, setTts] = useState(false);
  const [connIssue, setConnIssue] = useState(false);

  const offset = useRef(0);
  const lastNow = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((text: string, info = false) => {
    setToast({ text, info });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const apply = useCallback((v: RoomView) => {
    if (v.now < lastNow.current) return; // stale response
    lastNow.current = v.now;
    offset.current = v.now - Date.now();
    setView(v);
  }, []);

  // Load session
  useEffect(() => {
    const s = getSession(code);
    if (!s) {
      router.replace(`/?code=${code}`);
      return;
    }
    setSession(s);
    try {
      setTts(localStorage.getItem(TTS_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, [code, router]);

  // Polling loop
  const phase = view?.phase;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  useEffect(() => {
    if (!session) return;
    let stop = false;
    let n = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stop) return;
      const ping = n++ % 5 === 0;
      try {
        const v = await api.poll(code, session, ping);
        if (stop) return;
        setConnIssue(false);
        if (!v.me) {
          clearSession(code);
          setFatal("You're no longer in this room.");
          stop = true;
          return;
        }
        apply(v);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          clearSession(code);
          setFatal(`Room ${code} doesn't exist anymore.`);
          stop = true;
          return;
        }
        setConnIssue(true);
      }
      const p = phaseRef.current;
      const hidden = typeof document !== "undefined" && document.hidden;
      const delay = hidden ? 4000 : p === "presenting" || p === "choosing" ? 1000 : 1500;
      timer = setTimeout(tick, delay);
    };
    tick();
    const onVis = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [session, code, apply]);

  const act = useCallback(
    async (action: Action) => {
      if (!session) return;
      try {
        const v = await api.act(code, session, action);
        apply(v);
        return v;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        if (err instanceof ApiError && err.status === 403 && /not in this room/.test(msg)) {
          clearSession(code);
          setFatal("You're no longer in this room.");
        } else {
          showToast(msg);
        }
        throw err;
      }
    },
    [session, code, apply, showToast],
  );
  const safeAct = useCallback((a: Action) => act(a).catch(() => undefined), [act]);

  const leave = useCallback(async () => {
    if (!confirm("Leave this room?")) return;
    await safeAct({ type: "leave" });
    clearSession(code);
    router.push("/");
  }, [safeAct, code, router]);

  // Read new sentences aloud (like the in-game narrator)
  const spoken = useRef<Set<number>>(new Set());
  const sentences = view?.round?.sentences;
  useEffect(() => {
    if (!sentences) {
      spoken.current = new Set();
      return;
    }
    const fresh = sentences.filter((s) => !spoken.current.has(s.id));
    fresh.forEach((s) => spoken.current.add(s.id));
    if (!tts || typeof speechSynthesis === "undefined" || fresh.length === 0) return;
    // Only speak the newest one (avoids a backlog after reconnecting)
    const u = new SpeechSynthesisUtterance(fresh[fresh.length - 1].text.replace(/"/g, ""));
    u.rate = 1.05;
    u.pitch = 1.1;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }, [sentences, tts]);

  // Buzz when it becomes your turn
  const myTurn = view?.phase === "choosing" && view.presenterId === view.me?.id;
  useEffect(() => {
    if (myTurn && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([80, 60, 80]);
  }, [myTurn]);

  // Tell guessers when someone solves it
  const solveCount = view?.round?.solves.length ?? 0;
  const prevSolves = useRef(0);
  useEffect(() => {
    if (view?.phase === "presenting" && solveCount > prevSolves.current && view.round) {
      const last = view.round.solves[view.round.solves.length - 1];
      if (last && last.pid !== view.me?.id) {
        const name = view.players.find((p) => p.id === last.pid)?.name ?? "Someone";
        showToast(`${name} got it!`, true);
      }
    }
    prevSolves.current = solveCount;
  }, [solveCount, view, showToast]);

  function toggleTts() {
    const next = !tts;
    setTts(next);
    try {
      localStorage.setItem(TTS_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (next && typeof speechSynthesis !== "undefined") {
      const u = new SpeechSynthesisUtterance("Narrator on.");
      speechSynthesis.speak(u);
    }
  }

  if (fatal) {
    return (
      <main className="page">
        <div className="stage">
          <h1>😵 Uh oh</h1>
          <p>{fatal}</p>
          <button className="btn" onClick={() => router.push(`/?code=${code}`)} style={{ maxWidth: 320 }}>
            Back to start
          </button>
        </div>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="page">
        <div className="stage">
          <div className="spinner" />
          <p>Joining {code}…</p>
        </div>
      </main>
    );
  }

  const isHost = !!view.me?.isHost;
  const inGame = view.phase !== "lobby" && view.phase !== "gameover";
  const isPresenter = view.me?.id === view.presenterId;
  const showTimer = view.phase === "choosing" || view.phase === "presenting";

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <div className="code">{view.code}</div>
          <div className="meta">
            {inGame
              ? `Round ${view.turn.round}/${view.turn.rounds} · Turn ${view.turn.index + 1}/${view.turn.total}`
              : view.phase === "lobby"
                ? "Lobby"
                : "Game over"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {showTimer && <Timer endsAt={view.phaseEndsAt} offset={offset.current} />}
          <button
            className={`iconbtn${tts ? " on" : ""}`}
            onClick={toggleTts}
            aria-label={tts ? "Turn narrator off" : "Turn narrator on"}
            title="Read sentences aloud"
          >
            {tts ? "🔊" : "🔈"}
          </button>
          <button className="iconbtn" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">
            ⋯
          </button>
        </div>
        {menuOpen && (
          <div className="menu" onClick={() => setMenuOpen(false)}>
            {isHost && inGame && (
              <button onClick={() => safeAct({ type: "skip" })}>
                ⏭ {view.phase === "reveal" ? "Next turn" : "Skip this turn"}
              </button>
            )}
            {isHost && inGame && (
              <button
                className="danger"
                onClick={() => {
                  if (confirm("End the game for everyone?")) safeAct({ type: "endGame" });
                }}
              >
                ⏹ End game
              </button>
            )}
            <button className="danger" onClick={leave}>
              🚪 Leave room
            </button>
          </div>
        )}
      </header>

      {connIssue && <div className="toast info">Reconnecting…</div>}
      {toast && <div className={`toast${toast.info ? " info" : ""}`}>{toast.text}</div>}

      {view.phase === "lobby" && <Lobby view={view} act={safeAct} onLeave={leave} />}
      {view.phase === "choosing" && <Choosing view={view} act={act} />}
      {view.phase === "presenting" &&
        (isPresenter ? <PresenterView view={view} act={act} /> : <GuesserView view={view} act={act} />)}
      {view.phase === "reveal" && <Reveal view={view} act={safeAct} />}
      {view.phase === "gameover" && <GameOver view={view} act={safeAct} onLeave={leave} />}
    </main>
  );
}
