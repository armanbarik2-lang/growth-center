import { q, one, num } from "@/lib/db";
import { refreshSequences } from "@/lib/outreach";
import { istDay } from "@/lib/metrics";
import { todayOf } from "@/lib/session";
import { requireCtx, isResp, json } from "@/lib/api";

export async function GET(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  await refreshSequences(ctx);
  const u = new URL(req.url).searchParams;
  const owner = ctx.me.role === "head" ? u.get("owner") || null : ctx.me.id;
  const today = istDay(todayOf(ctx.ds));
  const p: unknown[] = owner ? [ctx.ds.id, today, owner] : [ctx.ds.id, today];
  const of = owner ? "and e.owner_id=$3" : "";
  const stats = await one<Record<string, unknown>>(`
    select count(*) filter (where e.status='active') active, count(*) filter (where e.status='replied') replied,
      count(*) filter (where e.status='replied' and e.reply_outcome='positive') positive,
      count(*) filter (where e.status='switch_contact') switch_contact, count(*) total,
      (select count(*) from outreach_steps s join enrollments e2 on e2.id=s.enrollment_id where s.ds=$1 and s.status='sent' ${owner ? "and e2.owner_id=$3" : ""}) emails_sent,
      (select count(*) from outreach_steps s join enrollments e2 on e2.id=s.enrollment_id where s.ds=$1 and s.status='sent' and s.done_at >= $2::date - 7 ${owner ? "and e2.owner_id=$3" : ""}) sent_7d,
      (select count(*) from outreach_steps s join enrollments e2 on e2.id=s.enrollment_id where s.ds=$1 and s.status='pending' and e2.status='active' and s.due_date = $2::date ${owner ? "and e2.owner_id=$3" : ""}) due_today,
      (select count(*) from outreach_steps s join enrollments e2 on e2.id=s.enrollment_id where s.ds=$1 and s.status='pending' and e2.status='active' and s.due_date < $2::date ${owner ? "and e2.owner_id=$3" : ""}) overdue
    from enrollments e where e.ds=$1 ${of}`, p);
  const queue = await q(`
    select s.id, s.step_no, s.day, s.type, s.due_date::text due, s.subject, s.body, e.id enrollment_id, e.owner_id, m.name owner_name,
      co.name company, co.id company_id, ct.name contact, ct.email, ct.title contact_title, d.id deal_id, d.stage,
      (select count(*) from outreach_steps x where x.enrollment_id=e.id) total_steps
    from outreach_steps s join enrollments e on e.id=s.enrollment_id join companies co on co.id=e.company_id
      left join contacts ct on ct.id=e.contact_id left join members m on m.id=e.owner_id left join deals d on d.id=e.deal_id
    where s.ds=$1 and s.status='pending' and e.status='active' and s.due_date <= $2::date ${of}
    order by s.due_date, s.type desc, co.name limit 300`, p);
  const p2: unknown[] = owner ? [ctx.ds.id, owner] : [ctx.ds.id];
  const of2 = owner ? "and e.owner_id=$2" : "";
  const enrollments = await q(`
    select e.id, e.status, e.started_at, e.stop_reason, e.reply_outcome, e.owner_id, m.name owner_name, co.name company, co.id company_id, ct.name contact,
      e.deal_id, sq.name sequence, count(s.id) total_steps, count(s.id) filter (where s.status in ('sent','done')) done_steps,
      count(s.id) filter (where s.status='sent') emails_sent,
      min(s.due_date) filter (where s.status='pending')::text next_due,
      (array_agg(s.type order by s.step_no) filter (where s.status='pending'))[1] next_type
    from enrollments e join companies co on co.id=e.company_id left join contacts ct on ct.id=e.contact_id left join members m on m.id=e.owner_id
      left join sequences sq on sq.id=e.sequence_id left join outreach_steps s on s.enrollment_id=e.id
    where e.ds=$1 ${of2} group by e.id, m.name, co.name, co.id, ct.name, sq.name
    order by case e.status when 'switch_contact' then 0 when 'replied' then 1 when 'active' then 2 else 3 end, e.started_at desc limit 1500`, p2);
  const sequences = await q("select * from sequences where ds=$1 order by created_at", [ctx.ds.id]);
  const eligible = await q(`
    select d.id, co.name company, d.stage, m.name owner_name from deals d join companies co on co.id=d.company_id left join members m on m.id=d.owner_id
    where d.ds=$1 ${owner ? "and d.owner_id=$2" : ""} and d.stage in ('called','proposal_mailed','follow_up','contacted','proposal_sent')
      and not exists (select 1 from enrollments e where e.deal_id=d.id and e.status in ('active','replied'))
    order by co.name limit 200`, p2);
  return json({ today, stats: Object.fromEntries(Object.entries(stats || {}).map(([k, v]) => [k, num(v)])), queue, enrollments, sequences, eligible });
}
