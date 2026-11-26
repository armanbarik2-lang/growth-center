import { one } from "@/lib/db";
import { enroll } from "@/lib/outreach";
import { canEdit } from "@/lib/session";
import { requireCtx, isResp, json, err } from "@/lib/api";
export async function POST(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const { deal_ids, sequence_id } = await req.json();
  if (!Array.isArray(deal_ids) || !deal_ids.length) return err("Pick at least one company");
  const done: string[] = [], failed: string[] = [];
  for (const id of deal_ids.slice(0, 200)) {
    const d = await one<{ owner_id: string }>("select owner_id from deals where id=$1 and ds=$2", [id, ctx.ds.id]);
    if (!d || !canEdit(ctx, d.owner_id)) { failed.push(`${id}: not allowed`); continue; }
    try { await enroll(ctx, id, sequence_id); done.push(id); } catch (e) { failed.push((e as Error).message); }
  }
  return json({ enrolled: done.length, failed });
}
