"use client";

import type { Action } from "@/lib/game";
import type { RoomView } from "@/lib/types";
import { Avatar, nameOf, playerOf } from "./ui";

type Act = (a: Action) => Promise<unknown>;

export function Reveal({ view, act }: { view: RoomView; act: Act }) {
  const r = view.round;
  const scoringSolves = (r?.solves ?? []).filter((s) => s.points > 0);
  const presenter = playerOf(view, view.presenterId);
  const upNext = playerOf(view, view.upNextId);
  const lastSentence = r?.sentences[r.sentences.length - 1];

  return (
    <div className="stage">
      <p style={{ textTransform: "uppercase", letterSpacing: 2, fontWeight: 600 }}>It was…</p>
      <div className="reveal-answer">{r?.answer ?? "???"}</div>
      {lastSentence && (
        <p style={{ fontStyle: "italic", maxWidth: 360 }}>
          Last clue: &ldquo;{lastSentence.text}&rdquo;
        </p>
      )}

      <ul className="results" style={{ marginTop: 8 }}>
        {scoringSolves.length === 0 && (
          <li style={{ justifyContent: "center" }}>😬 Nobody got it!</li>
        )}
        {scoringSolves.map((s, i) => {
          const p = playerOf(view, s.pid);
          return (
            <li key={s.pid}>
              <span className="rank">{i === 0 ? "⚡" : `${i + 1}.`}</span>
              {p && <Avatar p={p} />}
              <span className="pname">{nameOf(view, s.pid)}</span>
              <span className="plus">+{s.points}</span>
            </li>
          );
        })}
        {presenter && (
          <li>
            <span className="rank">🎤</span>
            <Avatar p={presenter} />
            <span className="pname">{presenter.name}</span>
            <span className="plus">+{r?.presenterPoints ?? 0}</span>
          </li>
        )}
      </ul>

      <Scoreboard view={view} compact />

      {upNext ? (
        <p>
          Up next: <b style={{ color: "#fff" }}>{upNext.name}</b>
        </p>
      ) : (
        <p>That was the last turn!</p>
      )}
      {view.me?.isHost && (
        <button className="btn ghost" onClick={() => act({ type: "skip" })}>
          Continue now →
        </button>
      )}
    </div>
  );
}

export function Scoreboard({ view, compact }: { view: RoomView; compact?: boolean }) {
  const ranked = view.players.filter((p) => !p.audience).sort((a, b) => b.score - a.score);
  return (
    <ul className="results">
      {ranked.map((p) => {
        const rank = ranked.findIndex((x) => x.score === p.score) + 1;
        return (
          <li key={p.id} className={rank === 1 && !compact ? "first" : ""}>
            <span className="rank">{rank}</span>
            <Avatar p={p} />
            <span className="pname">
              {p.name}
              {p.id === view.me?.id ? " (you)" : ""}
            </span>
            <span className="total">{p.score}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function GameOver({ view, act, onLeave }: { view: RoomView; act: Act; onLeave: () => void }) {
  const ranked = view.players.filter((p) => !p.audience).sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score ?? 0;
  const winners = ranked.filter((p) => p.score === top && top > 0);
  const host = view.players.find((p) => p.isHost);

  return (
    <div className="stage" style={{ justifyContent: "flex-start" }}>
      <div className="trophy">🏆</div>
      <h1>
        {winners.length === 0
          ? "Game over!"
          : winners.length === 1
            ? `${winners[0].name} wins!`
            : `${winners.map((w) => w.name).join(" & ")} tie!`}
      </h1>
      <p>Thanks for blathering.</p>
      <Scoreboard view={view} />
      {view.me?.isHost ? (
        <button className="btn yellow" onClick={() => act({ type: "playAgain" })} style={{ marginTop: 8 }}>
          Play again (same room)
        </button>
      ) : (
        <p>Waiting for {host?.name ?? "the host"} to start another game…</p>
      )}
      <button className="btn ghost" onClick={onLeave}>
        Leave room
      </button>
    </div>
  );
}
