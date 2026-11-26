import { q, one } from "@/lib/db";
import { canEdit } from "@/lib/session";
import { requireCtx, isResp, json, err } from "@/lib/api";

const FIELDS = ["title", "details", "owner_id", "campaign_id", "deal_id", "due_date", "status", "priority"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const { id } = await params;
  const t = await one<{ owner_id: string }>("select owner_id from tasks where id=$1 and ds=$2", [id, ctx.ds.id]);
  if (!t) return err("Not found", 404);
  if (!canEdit(ctx, t.owner_id)) return err("Members can only edit their own tasks", 403);
  const b = await req.json();
  if (b.owner_id && ctx.me.role !== "head" && b.owner_id !== ctx.me.id) return err("Only heads can reassign tasks", 403);
  const sets: string[] = []; const vals: unknown[] = [];
  for (const f of FIELDS) if (f in b) { vals.push(b[f] === "" ? null : b[f]); sets.push(`${f}=$${vals.length}`); }
  if ("status" in b) sets.push(b.status === "done" ? "done_at=now()" : "done_at=null");
  if (!sets.length) return err("Nothing to update");
  vals.push(id);
  await q(`update tasks set ${sets.join(",")} where id=$${vals.length}`, vals);
  return json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const { id } = await params;
  const t = await one<{ owner_id: string }>("select owner_id from tasks where id=$1 and ds=$2", [id, ctx.ds.id]);
  if (!t) return err("Not found", 404);
  if (!canEdit(ctx, t.owner_id)) return err("Members can only delete their own tasks", 403);
  await q("delete from tasks where id=$1", [id]);
  return json({ ok: true });
}
