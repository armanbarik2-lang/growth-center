import { NextResponse } from "next/server";
import { getCtx, Ctx } from "./session";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}
export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
export async function requireCtx(): Promise<Ctx | NextResponse> {
  try {
    const c = await getCtx();
    if (!c) return err("Not signed in", 401);
    return c;
  } catch (e) {
    return err(`Database not ready: ${(e as Error).message}`, 503);
  }
}
export const isResp = (x: unknown): x is NextResponse => x instanceof NextResponse;
export function newId(ds: string, prefix: string) {
  return `${ds}:${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
