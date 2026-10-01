import { joinRoom } from "@/lib/game";
import { cleanCode, handleError, json, readBody } from "@/lib/api";
import { updateRoom } from "@/lib/store";

export const dynamic = "force-dynamic";

// Join (or re-join) a room. Body: { name, playerId?, token? }
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const code = cleanCode((await ctx.params).code);
    if (!code) return json({ error: "Room codes are 4 letters" }, 400);
    const body = await readBody(req);
    const now = Date.now();
    const res = await updateRoom(code, (s) =>
      joinRoom(s, body.name, now, {
        playerId: typeof body.playerId === "string" ? body.playerId : undefined,
        token: typeof body.token === "string" ? body.token : undefined,
      }),
    );
    if (!res) return json({ error: `Room ${code} doesn't exist` }, 404);
    return json({ code, playerId: res.result.id, token: res.result.token, audience: res.result.audience });
  } catch (err) {
    return handleError(err);
  }
}
