import { newRoom } from "@/lib/game";
import { handleError, json, readBody } from "@/lib/api";
import { createRoom } from "@/lib/store";

export const dynamic = "force-dynamic";

// Create a room. Body: { name }
export async function POST(req: Request) {
  try {
    const body = await readBody(req);
    let playerId = "";
    let token = "";
    const now = Date.now();
    const state = await createRoom((code) => {
      const { state, player } = newRoom(code, String(body.name ?? ""), now);
      playerId = player.id;
      token = player.token;
      return state;
    });
    return json({ code: state.code, playerId, token });
  } catch (err) {
    return handleError(err);
  }
}
