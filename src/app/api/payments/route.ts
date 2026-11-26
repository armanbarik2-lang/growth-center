import { q } from "@/lib/db";
import { signedKeys } from "@/lib/metrics";
import { requireCtx, isResp, json } from "@/lib/api";

export async function GET(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const owner = ctx.me.role === "head" ? new URL(req.url).searchParams.get("owner") : ctx.me.id;
  const p: unknown[] = [ctx.ds.id, signedKeys(ctx.ds)];
  if (owner) p.push(owner);
  const deals = await q(`select d.id, d.name, d.stage, d.confirmed_value, d.support_type, d.package, d.owner_id, m.name owner_name,
      cp.name campaign_name, cp.pays_after_fest, d.stage_changed_at
    from deals d left join members m on m.id=d.owner_id left join campaigns cp on cp.id=d.campaign_id
    where d.ds=$1 and d.stage = any($2::text[]) ${owner ? "and d.owner_id=$3" : ""} order by d.confirmed_value desc`, p);
  const ids = deals.map((d) => (d as { id: string }).id);
  const payments = await q("select p.*, p.due_date::text due from payments p where p.deal_id = any($1::text[]) order by p.due_date", [ids]);
  const deliverables = await q("select dl.*, dl.due_date::text due from deliverables dl where dl.deal_id = any($1::text[]) order by dl.item like 'Branding report%', dl.id", [ids]);
  const remarks = await q(`select n.id, n.deal_id, n.title, n.detail, n.created_at, a.name author_name from notes n left join members a on a.id=n.author_id
    where n.deal_id = any($1::text[]) and n.kind='remark' order by n.created_at desc`, [ids]);
  return json({ deals, payments, deliverables, remarks, fest_start: ctx.ds.fest_start, today: ctx.today.toISOString() });
}
