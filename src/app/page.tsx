"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getSavedName, getSession, saveName, saveSession } from "@/lib/client";
import { GAME_NAME, GAME_TAGLINE } from "@/lib/config";
import { Logo } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"join" | "host" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(getSavedName());
    const params = new URLSearchParams(window.location.search);
    const c = (params.get("code") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    if (c) setCode(c);
  }, []);

  const cleanName = name.trim().slice(0, 12);
  const canJoin = code.length === 4 && cleanName.length > 0;

  async function join(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canJoin || busy) return;
    setBusy("join");
    setError("");
    try {
      saveName(cleanName);
      const res = await api.join(code, cleanName, getSession(code));
      saveSession(code, { playerId: res.playerId, token: res.token });
      router.push(`/room/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join");
      setBusy(null);
    }
  }

  async function host() {
    if (!cleanName) {
      setError("Enter your name first");
      return;
    }
    if (busy) return;
    setBusy("host");
    setError("");
    try {
      saveName(cleanName);
      const res = await api.create(cleanName);
      saveSession(res.code, { playerId: res.playerId, token: res.token });
      router.push(`/room/${res.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create a room");
      setBusy(null);
    }
  }

  return (
    <main className="page">
      <Logo />
      <p className="tagline">{GAME_TAGLINE}</p>

      <form className="card" onSubmit={join}>
        <div className="field">
          <label className="label" htmlFor="code">
            Room code
          </label>
          <input
            id="code"
            className="input code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
            placeholder="ABCD"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            maxLength={4}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="name">
            Your name
          </label>
          <input
            id="name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 12))}
            placeholder="ENTER YOUR NAME"
            autoComplete="nickname"
            autoCorrect="off"
            spellCheck={false}
            maxLength={12}
          />
        </div>
        <div className="field">
          <button className="btn" type="submit" disabled={!canJoin || !!busy}>
            {busy === "join" ? "Joining…" : "Play"}
          </button>
        </div>
      </form>

      <div className="or">or</div>

      <button className="btn teal" onClick={host} disabled={!!busy}>
        {busy === "host" ? "Creating room…" : "Host a new game"}
      </button>

      {error && <div className="error">{error}</div>}

      <p className="tagline" style={{ fontSize: 13, marginTop: "auto" }}>
        {GAME_NAME} is a free fan-made party game for 2–8 players, each on their own phone.
      </p>
    </main>
  );
}
