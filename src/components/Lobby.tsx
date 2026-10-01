"use client";

import { useState } from "react";
import type { Action } from "@/lib/game";
import type { RoomView } from "@/lib/types";
import { Avatar } from "./ui";

const MIN_PLAYERS = 2;

export function HowToPlay({ open }: { open?: boolean }) {
  return (
    <details className="card howto" open={open}>
      <summary>❓ How to play</summary>
      <ol style={{ marginTop: 10 }}>
        <li>
          Each turn, one player is the <b>presenter</b>. They secretly pick a <b>Story</b>, <b>Person</b>,{" "}
          <b>Place</b> or <b>Thing</b>.
        </li>
        <li>
          The presenter can&apos;t type. They build clues from <b>fill-in-the-blank sentences</b> using only the
          words they&apos;re given. Some of those words are useful and some are nonsense.
        </li>
        <li>
          Everyone else types guesses on their phone. Every guess shows up for the whole room, and the presenter
          can use guesses in their clues (&ldquo;It&apos;s like <i>Finding Nemo</i>, but scary&rdquo;).
        </li>
        <li>
          Guess fast for more points. The presenter scores whenever someone gets it. After the first correct
          guess, everyone else has 20 seconds.
        </li>
        <li>Everyone presents once per round, and the prompts get harder each round.</li>
      </ol>
    </details>
  );
}

export function Lobby({
  view,
  act,
  onLeave,
}: {
  view: RoomView;
  act: (a: Action) => Promise<unknown>;
  onLeave: () => void;
}) {
  const me = view.me!;
  const isHost = me.isHost;
  const players = view.players.filter((p) => !p.audience);
  const audience = view.players.filter((p) => p.audience);
  const [copied, setCopied] = useState(false);
  const host = view.players.find((p) => p.isHost);

  async function share() {
    const url = `${window.location.origin}/?code=${view.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join my game", text: `Join my game! Room code: ${view.code}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* cancelled */
    }
  }

  const s = view.settings;
  return (
    <>
      <div className="roomcode">
        <div className="label" style={{ color: "rgba(255,255,255,.6)" }}>
          Room code
        </div>
        <div className="big">{view.code}</div>
        <button className="btn ghost" onClick={share} style={{ width: "auto", margin: "0 auto" }}>
          {copied ? "✓ Link copied" : "🔗 Share invite link"}
        </button>
      </div>

      <section className="card">
        <h3>
          Players <span className="muted">({players.length}/8)</span>
        </h3>
        <ul className="plist">
          {players.map((p) => (
            <li key={p.id} className={p.connected ? "" : "offline"}>
              <Avatar p={p} />
              <span className="pname">{p.name}</span>
              {p.id === me.id && <span className="tag teal">You</span>}
              {p.isHost && <span className="tag yellow">👑 Host</span>}
              {isHost && p.id !== me.id && (
                <button
                  className="iconbtn"
                  style={{ background: "rgba(27,16,64,.08)", width: 32, height: 32, fontSize: 14 }}
                  aria-label={`Kick ${p.name}`}
                  onClick={() => {
                    if (confirm(`Kick ${p.name}?`)) act({ type: "kick", target: p.id });
                  }}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
          {players.length < 2 && (
            <li className="muted" style={{ justifyContent: "center" }}>
              Waiting for more players…
            </li>
          )}
        </ul>
        {audience.length > 0 && (
          <p className="muted" style={{ margin: "10px 0 0", fontSize: 14 }}>
            Audience: {audience.map((a) => a.name).join(", ")}
          </p>
        )}
      </section>

      <section className="card">
        <h3>Settings</h3>
        <div className="field">
          <span className="label">Rounds</span>
          <div className="seg">
            {[1, 2, 3].map((r) => (
              <button
                key={r}
                className={s.rounds === r ? "on" : ""}
                disabled={!isHost}
                onClick={() => act({ type: "settings", rounds: r })}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Time per turn</span>
          <div className="seg">
            {[60, 90, 120, 150, 180].map((t) => (
              <button
                key={t}
                className={s.roundSeconds === t ? "on" : ""}
                disabled={!isHost}
                onClick={() => act({ type: "settings", roundSeconds: t })}
              >
                {t < 120 ? `${t}s` : `${t / 60}m`}
              </button>
            ))}
          </div>
        </div>
        <p className="muted" style={{ margin: "12px 0 0", fontSize: 14 }}>
          Each player presents {s.rounds === 1 ? "once" : `${s.rounds} times`}. Round 1 is easy
          {s.rounds > 1 ? ", then it gets harder" : ""}.
        </p>
      </section>

      <HowToPlay />

      {isHost ? (
        <button
          className="btn yellow"
          disabled={players.length < MIN_PLAYERS}
          onClick={() => act({ type: "start" })}
        >
          {players.length < MIN_PLAYERS ? `Need ${MIN_PLAYERS}+ players` : "Everybody's in — start!"}
        </button>
      ) : (
        <p className="center" style={{ color: "rgba(255,255,255,.75)" }}>
          Waiting for <b>{host?.name ?? "the host"}</b> to start the game…
        </p>
      )}
      <button className="btn ghost" onClick={onLeave}>
        Leave room
      </button>
    </>
  );
}
