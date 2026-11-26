import { q, one } from "@/lib/db";
import { canEdit } from "@/lib/session";
import { requireCtx, isResp, json, err } from "@/lib/api";

async function check(id: string) {
  const ctx = await requireCtx(); if (isResp(ctx)) return { res: ctx };
  const x = await one<{ owner_id: string }>("select d.owner_id from deliverables dl join deals d on d.id=dl.deal_id where dl.id=$1 and dl.ds=$2", [id, ctx.ds.id]);
  if (!x) return { res: err("Not found", 404) };
  if (!canEdit(ctx, x.owner_id)) return { res: err("Members can only update their own deals", 403) };
  return { ctx };
}
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const c = await check(id); if (c.res) return c.res;
  const b = await req.json();
  if (b.status) await q("update deliverables set status=$1, done_at = case when $1='done' then now() else null end where id=$2", [b.status === "done" ? "done" : "pending", id]);
  if (b.item) await q("update deliverables set item=$1 where id=$2", [b.item, id]);
  if ("due_date" in b) await q("update deliverables set due_date=$1 where id=$2", [b.due_date || null, id]);
  return json({ ok: true });
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const c = await check(id); if (c.res) return c.res;
  await q("delete from deliverables where id=$1", [id]);
  return json({ ok: true });
}
