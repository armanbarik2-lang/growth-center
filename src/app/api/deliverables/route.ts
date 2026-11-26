import { q, one } from "@/lib/db";
import { canEdit } from "@/lib/session";
import { requireCtx, isResp, json, err, newId } from "@/lib/api";
export async function POST(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const b = await req.json();
  const d = await one<{ owner_id: string }>("select owner_id from deals where id=$1 and ds=$2", [b.deal_id, ctx.ds.id]);
  if (!d) return err("Deal not found", 404);
  if (!canEdit(ctx, d.owner_id)) return err("Members can only edit their own deals", 403);
  if (!b.item?.trim()) return err("Deliverable is required");
  const id = newId(ctx.ds.id, "DL");
  await q("insert into deliverables (id, ds, deal_id, item, status, due_date) values ($1,$2,$3,$4,'pending',$5)", [id, ctx.ds.id, b.deal_id, b.item.trim(), b.due_date || null]);
  return json({ id });
}
