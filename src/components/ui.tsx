"use client";

import { useEffect, useState } from "react";
import { GAME_NAME, PLAYER_COLORS } from "@/lib/config";
import type { PublicPlayer, RoomView } from "@/lib/types";

export function Logo({ small }: { small?: boolean }) {
  const [a, ...rest] = GAME_NAME.split(" ");
  return (
    <div className={`logo${small ? " small" : ""}`} aria-label={GAME_NAME}>
      <span className="l1">{a}</span>
      <br />
      <span className="l2">{rest.join(" ")}</span>
    </div>
  );
}

export const colorOf = (i: number) => PLAYER_COLORS[i % PLAYER_COLORS.length];

export function Avatar({ p, big }: { p: Pick<PublicPlayer, "name" | "color">; big?: boolean }) {
  return (
    <span className={`avatar${big ? " big" : ""}`} style={{ background: colorOf(p.color) }} aria-hidden>
      {p.name.slice(0, 1)}
    </span>
  );
}

/** Milliseconds left until `endsAt` (server clock), re-rendering ~4x/sec. */
export function useRemaining(endsAt: number, offset: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, endsAt - (now + offset));
}

export function Timer({ endsAt, offset, lowAt = 10 }: { endsAt: number; offset: number; lowAt?: number }) {
  const ms = useRemaining(endsAt, offset);
  const secs = Math.ceil(ms / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return (
    <span className={`timer${secs <= lowAt ? " low" : ""}`} aria-label={`${secs} seconds left`}>
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

export function PlayerStrip({ view }: { view: RoomView }) {
  const solved = new Set(view.round?.solvedIds ?? []);
  const players = view.players.filter((p) => !p.audience);
  return (
    <div className="strip">
      {players.map((p) => (
        <div
          key={p.id}
          className={`chip${solved.has(p.id) ? " solved" : ""}${view.presenterId === p.id ? " presenting" : ""}${
            p.connected ? "" : " offline"
          }`}
        >
          <Avatar p={p} />
          <span>
            {view.presenterId === p.id ? "🎤 " : solved.has(p.id) ? "✓ " : ""}
            {p.name}
          </span>
          <span className="pts">{p.score}</span>
        </div>
      ))}
    </div>
  );
}

export function nameOf(view: RoomView, id: string | null | undefined) {
  return view.players.find((p) => p.id === id)?.name ?? "Someone";
}
export function playerOf(view: RoomView, id: string | null | undefined) {
  return view.players.find((p) => p.id === id);
}
