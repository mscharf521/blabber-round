import { advance, viewFor } from "@/lib/game";
import { cleanCode, handleError, json } from "@/lib/api";
import { loadRoom, updateRoom } from "@/lib/store";
import type { RoomState } from "@/lib/types";

export const dynamic = "force-dynamic";

function authed(s: RoomState, pid: string | null, token: string | null) {
  if (!pid || !token) return null;
  const p = s.players.find((x) => x.id === pid);
  return p && p.token === token ? p : null;
}

// Poll the room. Query: ?pid=&token=&ping=1
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const code = cleanCode((await ctx.params).code);
    if (!code) return json({ error: "Room codes are 4 letters" }, 400);
    const url = new URL(req.url);
    const pid = url.searchParams.get("pid");
    const token = url.searchParams.get("token");
    const ping = url.searchParams.get("ping") === "1";

    const loaded = await loadRoom(code);
    if (!loaded) return json({ error: `Room ${code} doesn't exist` }, 404);

    const now = Date.now();
    let state = loaded.state;
    const me = authed(state, pid, token);
    const needsPing = !!me && ping && now - me.lastSeen > 4000;
    // Probe: does the clock need to move the game forward?
    const probe = structuredClone(state);
    const needsAdvance = advance(probe, now);

    if (needsPing || needsAdvance) {
      const res = await updateRoom(code, (s) => {
        const p = authed(s, pid, token);
        let changed = false;
        if (p && ping && now - p.lastSeen > 4000) {
          p.lastSeen = now;
          changed = true;
        }
        if (advance(s, now)) changed = true;
        return changed;
      }, { shouldSave: (changed) => changed });
      if (res) state = res.state;
    }

    const viewer = authed(state, pid, token);
    return json(viewFor(state, viewer?.id ?? null, now));
  } catch (err) {
    return handleError(err);
  }
}
