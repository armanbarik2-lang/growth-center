import { q } from "@/lib/db";
import { requireCtx, isResp, json } from "@/lib/api";
export async function POST(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const { ids } = await req.json();
  if (Array.isArray(ids) && ids.length) {
    await q(`insert into note_reads (note_id, member_id) select unnest($1::text[]), $2 on conflict do nothing`, [ids, ctx.me.id]);
  }
  return json({ ok: true });
}
