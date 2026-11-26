import { q } from "@/lib/db";
import { campaignMetrics } from "@/lib/metrics";
import { requireCtx, isResp, json, err, newId } from "@/lib/api";

export async function GET(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  if (ctx.me.role !== "head") return json(await q("select id, name, kind from campaigns where ds=$1 order by kind='base' desc, rank nulls last, name", [ctx.ds.id]));
  const owner = new URL(req.url).searchParams.get("owner");
  return json(await campaignMetrics(ctx.ds, owner || null));
}

export async function POST(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  if (ctx.me.role !== "head") return err("Only heads can create campaigns", 403);
  const b = await req.json();
  if (!b.name) return err("Name is required");
  const id = newId(ctx.ds.id, "CMP");
  await q(`insert into campaigns (id, ds, name, kind, channel, objective, audience, owner_id, start_at, end_at, budget, spent,
    target_deals, target_value, test, kpi, rule, pact, rank) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [id, ctx.ds.id, b.name, b.kind || "campaign", b.channel || null, b.objective || null, b.audience || null, b.owner_id || ctx.me.id,
     b.start_at || null, b.end_at || null, b.budget ?? null, b.spent ?? 0, b.target_deals ?? null, b.target_value ?? null,
     b.test || null, b.kpi || null, JSON.stringify(b.rule || { type: "campusfest_default" }), b.pact ? JSON.stringify(b.pact) : null, b.rank ?? null]);
  return json({ id });
}
