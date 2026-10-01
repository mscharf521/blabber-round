import { NextResponse } from "next/server";
import { GameError } from "./game";

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export function handleError(err: unknown) {
  if (err instanceof GameError) return json({ error: err.message }, err.status);
  console.error(err);
  return json({ error: err instanceof Error ? err.message : "Something went wrong" }, 500);
}

export function cleanCode(raw: string): string | null {
  const code = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return code.length === 4 ? code : null;
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
