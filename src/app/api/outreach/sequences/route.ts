import { q } from "@/lib/db";
import { requireCtx, isResp, json, err, newId } from "@/lib/api";
export async function POST(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  if (ctx.me.role !== "head") return err("Only heads can create sequences", 403);
  const b = await req.json();
  if (!b.name || !Array.isArray(b.steps) || !b.steps.length) return err("Name and at least one step are required");
  const id = newId(ctx.ds.id, "SEQ");
  await q("insert into sequences (id, ds, name, description, steps, auto_start, stop_on_reply, switch_after_days, created_by) values ($1,$2,$3,$4,$5,$6,true,$7,$8)",
    [id, ctx.ds.id, b.name, b.description || null, JSON.stringify(b.steps), !!b.auto_start, Number(b.switch_after_days) || 21, ctx.me.id]);
  return json({ id });
}
