import { q } from "@/lib/db";
import { requireCtx, isResp, json } from "@/lib/api";
export async function GET() {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  return json(await q("select id, name, role, sector_group, title from members where ds=$1 order by role, name", [ctx.ds.id]));
}
