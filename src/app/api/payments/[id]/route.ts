import { q, one } from "@/lib/db";
import { canEdit } from "@/lib/session";
import { requireCtx, isResp, json, err } from "@/lib/api";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const { id } = await params;
  const p = await one<{ owner_id: string; deal_id: string }>("select d.owner_id, p.deal_id from payments p join deals d on d.id=p.deal_id where p.id=$1 and p.ds=$2", [id, ctx.ds.id]);
  if (!p) return err("Not found", 404);
  if (!canEdit(ctx, p.owner_id)) return err("Members can only update payments on their own deals", 403);
  const b = await req.json();
  const status = b.status as string;
  if (!["due", "paid", "written_off"].includes(status)) return err("Bad status");
  if (b.amount !== undefined && b.amount !== null && !(Number.isFinite(Number(b.amount)) && Number(b.amount) >= 0)) return err("Amount must be a number, 0 or more");
  await q("update payments set status=$1, paid_at = case when $1='paid' then coalesce($2::timestamptz, now()) else null end, amount=coalesce($3, amount) where id=$4",
    [status, b.paid_at || null, b.amount ?? null, id]);
  // keep deal stage in step with payments in the simulated plan
  if (ctx.ds.simulated && status === "paid") {
    const k = await one<{ kind: string }>("select kind from payments where id=$1", [id]);
    const next = k?.kind === "balance" ? "balance_paid" : "advance_paid";
    const idx = ctx.ds.stages.findIndex((s) => s.key === next);
    await q("update deals set stage=$1, furthest_idx=greatest(furthest_idx,$2), updated_at=now(), stage_changed_at=now() where id=$3 and furthest_idx < $2", [next, idx, p.deal_id]);
  }
  return json({ ok: true });
}
