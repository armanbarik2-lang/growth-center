import { q, one } from "@/lib/db";
import { requireCtx, isResp, json, err } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const { id } = await params;
  const company = await one(`select c.*, m.name owner_name, cp.name campaign_name from companies c left join members m on m.id=c.owner_id
    left join campaigns cp on cp.id=c.campaign_id where c.id=$1 and c.ds=$2`, [id, ctx.ds.id]);
  if (!company) return err("Not found", 404);
  const contacts = await q("select * from contacts where company_id=$1 order by active desc, created_at", [id]);
  const deals = await q(`select d.*, m.name owner_name, cp.name campaign_name from deals d left join members m on m.id=d.owner_id
    left join campaigns cp on cp.id=d.campaign_id where d.company_id=$1`, [id]);
  const activities = await q(`select a.*, m.name owner_name, ct.name contact_name, cp.name campaign_name from activities a
    left join members m on m.id=a.owner_id left join contacts ct on ct.id=a.contact_id left join campaigns cp on cp.id=a.campaign_id
    where a.company_id=$1 order by a.occurred_at desc limit 100`, [id]);
  const history = await q("select h.*, m.name changed_by_name from deal_history h left join members m on m.id=h.changed_by where h.deal_id = any($1::text[]) order by h.effective_at desc",
    [deals.map((d) => (d as { id: string }).id)]);
  const qual = await q("select * from qualification_history where company_id=$1 order by effective_at desc", [id]);
  if (ctx.me.role !== "head") {
    for (const d of deals as Record<string, unknown>[]) if (d.owner_id !== ctx.me.id) { d.proposed_value = null; d.confirmed_value = null; }
    const own = new Set((deals as Record<string, unknown>[]).filter((d) => d.owner_id === ctx.me.id).map((d) => d.id));
    for (const h of history as Record<string, unknown>[]) if (!own.has(h.deal_id)) { h.proposed_value = null; h.confirmed_value = null; }
  }
  const sequences = await q(`select e.id, e.status, e.deal_id, e.stop_reason, e.reply_outcome, e.started_at, sq.name,
      count(s.id) total, count(s.id) filter (where s.status in ('sent','done')) done,
      min(s.due_date) filter (where s.status='pending')::text next_due
    from enrollments e left join sequences sq on sq.id=e.sequence_id left join outreach_steps s on s.enrollment_id=e.id
    where e.company_id=$1 and e.ds=$2 group by e.id, sq.name order by e.started_at desc limit 3`, [id, ctx.ds.id]);
  return json({ company, contacts, deals, activities, history, qualification: qual, sequences });
}
