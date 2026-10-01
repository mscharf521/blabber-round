"use client";

import { useState } from "react";
import { CATEGORY_ICON, CATEGORY_LABEL, DIFFICULTY_LABEL } from "@/lib/templates";
import type { Action } from "@/lib/game";
import type { RoomView } from "@/lib/types";
import { Avatar, PlayerStrip, playerOf } from "./ui";

export function Choosing({ view, act }: { view: RoomView; act: (a: Action) => Promise<unknown> }) {
  const isPresenter = view.me?.id === view.presenterId;
  const presenter = playerOf(view, view.presenterId);
  const [picked, setPicked] = useState<string | null>(null);

  if (isPresenter && view.round?.options) {
    return (
      <>
        <PlayerStrip view={view} />
        <div className="stage" style={{ flex: "none", paddingBottom: 0 }}>
          <h1>You&apos;re up!</h1>
          <p>Pick a secret to describe. Nobody else can see these.</p>
        </div>
        <div className="options">
          {view.round.options.map((o) => (
            <button
              key={o.id}
              className="option"
              disabled={!!picked}
              style={{ opacity: picked && picked !== o.id ? 0.4 : 1 }}
              onClick={() => {
                setPicked(o.id);
                act({ type: "choose", promptId: o.id }).catch(() => setPicked(null));
              }}
            >
              <span className="ico">{CATEGORY_ICON[o.category]}</span>
              <span>
                <span className="sub">
                  {CATEGORY_LABEL[o.category]} ·{" "}
                  <span className={`diff-${o.difficulty}`}>{DIFFICULTY_LABEL[o.difficulty]}</span>
                </span>
                <br />
                <span className="ans">{o.answer}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="center" style={{ color: "rgba(255,255,255,.6)", fontSize: 14 }}>
          If the timer runs out, the first one is picked for you.
        </p>
      </>
    );
  }

  return (
    <>
      <PlayerStrip view={view} />
      <div className="stage">
        {presenter && <Avatar p={presenter} big />}
        <h1>{presenter?.name ?? "Someone"} is picking a secret…</h1>
        <p>Get ready to guess!</p>
      </div>
    </>
  );
}
