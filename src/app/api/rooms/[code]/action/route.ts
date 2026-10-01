import { advance, applyAction, GameError, viewFor, type Action } from "@/lib/game";
import { cleanCode, handleError, json, readBody } from "@/lib/api";
import { updateRoom } from "@/lib/store";

export const dynamic = "force-dynamic";

// Perform an action. Body: { pid, token, action: {...} }
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const code = cleanCode((await ctx.params).code);
    if (!code) return json({ error: "Room codes are 4 letters" }, 400);
    const body = await readBody(req);
    const pid = String(body.pid ?? "");
    const token = String(body.token ?? "");
    const action = body.action as Action | undefined;
    if (!action || typeof action !== "object" || typeof action.type !== "string") {
      return json({ error: "Missing action" }, 400);
    }

    const now = Date.now();
    const res = await updateRoom(code, (s) => {
      const p = s.players.find((x) => x.id === pid);
      if (!p || p.token !== token) throw new GameError("You're not in this room", 403);
      advance(s, now);
      applyAction(s, pid, action, now);
      return true;
    });
    if (!res) return json({ error: `Room ${code} doesn't exist` }, 404);
    return json(viewFor(res.state, pid, now));
  } catch (err) {
    return handleError(err);
  }
}
