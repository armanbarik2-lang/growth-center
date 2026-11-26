import { q } from "@/lib/db";
import { requireCtx, isResp, json, err } from "@/lib/api";
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  if (ctx.me.role !== "head") return err("Only heads can edit sequences", 403);
  const { id } = await params;
  const b = await req.json();
  if (b.auto_start) await q("update sequences set auto_start=false where ds=$1 and id<>$2", [ctx.ds.id, id]);
  await q(`update sequences set name=coalesce($1,name), description=coalesce($2,description), steps=coalesce($3::jsonb,steps),
    auto_start=coalesce($4,auto_start), switch_after_days=coalesce($5,switch_after_days) where id=$6 and ds=$7`,
    [b.name ?? null, b.description ?? null, b.steps ? JSON.stringify(b.steps) : null, typeof b.auto_start === "boolean" ? b.auto_start : null,
     b.switch_after_days ? Number(b.switch_after_days) : null, id, ctx.ds.id]);
  return json({ ok: true });
}
