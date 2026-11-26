import { PoolClient } from "pg";
import { q, one, tx } from "./db";
import { Ctx, todayOf } from "./session";
import { istDay } from "./metrics";

type Step = { day: number; type: "email" | "call"; subject: string; body: string };
const nid = (ds: string, p: string) => `${ds}:${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function render(t: string, v: Record<string, string>) {
  return t.replace(/\{\{(\w+)\}\}/g, (_, k) => v[k] ?? "");
}

/** Mark sequences that reached the switch-contact day without a reply. Runs on every read. */
export async function refreshSequences(ctx: Ctx) {
  await q(`update enrollments e set status='switch_contact', stopped_at=e.started_at + make_interval(days => s.switch_after_days), stop_reason='No reply in 3 weeks'
    from sequences s where s.id=e.sequence_id and e.ds=$1 and e.status='active' and e.started_at + make_interval(days => s.switch_after_days) <= $2::timestamptz`,
    [ctx.ds.id, todayOf(ctx.ds).toISOString()]);
  await q(`update outreach_steps st set status='skipped' from enrollments e where e.id=st.enrollment_id and e.ds=$1 and e.status <> 'active' and st.status='pending'`, [ctx.ds.id]);
}

/** Enroll one deal: creates every step with its due date and a personalised draft. */
export async function enroll(ctx: Ctx, dealId: string, sequenceId?: string | null, c?: PoolClient) {
  const run = c ? (sql: string, p: unknown[]) => c.query(sql, p).then((r) => r.rows) : q;
  const [d] = await run(`select d.id, d.company_id, d.contact_id, d.owner_id, d.package, co.name company, ct.name contact, m.name owner
    from deals d join companies co on co.id=d.company_id left join contacts ct on ct.id=d.contact_id left join members m on m.id=d.owner_id
    where d.id=$1 and d.ds=$2`, [dealId, ctx.ds.id]) as Record<string, string>[];
  if (!d) throw new Error("Deal not found");
  const [active] = await run("select id from enrollments where deal_id=$1 and status='active'", [dealId]);
  if (active) throw new Error(`${d.company} is already in an active sequence`);
  const [seq] = await run(sequenceId ? "select * from sequences where id=$1 and ds=$2" : "select * from sequences where ds=$1 order by auto_start desc, created_at limit 1",
    sequenceId ? [sequenceId, ctx.ds.id] : [ctx.ds.id]) as { id: string; steps: Step[] }[];
  if (!seq) throw new Error("No sequence set up");
  const eid = nid(ctx.ds.id, "E");
  const start = todayOf(ctx.ds);
  await run(`insert into enrollments (id, ds, sequence_id, deal_id, company_id, contact_id, owner_id, status, started_at) values ($1,$2,$3,$4,$5,$6,$7,'active',$8)`,
    [eid, ctx.ds.id, seq.id, d.id, d.company_id, d.contact_id, d.owner_id, start.toISOString()]);
  const vars = { first_name: (d.contact || "there").split(" ")[0], company: d.company, sender: d.owner || ctx.me.name, package: d.package || "Corporate", fest: ctx.ds.simulated ? "GEF Mumbai 2027" : ctx.ds.name.replace(/ \(.*\)/, "") };
  for (let i = 0; i < seq.steps.length; i++) {
    const s = seq.steps[i];
    const due = istDay(new Date(start.getTime() + s.day * 86400000));
    await run(`insert into outreach_steps (id, ds, enrollment_id, step_no, day, type, due_date, status, subject, body) values ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9)`,
      [nid(ctx.ds.id, "S"), ctx.ds.id, eid, i + 1, s.day, s.type, due, render(s.subject, vars), render(s.body, vars)]);
  }
  return eid;
}

/** A reply stops the sequence. The owner handles it by hand: a task is created and the deal stage follows the outcome. */
export async function recordReply(ctx: Ctx, enrollmentId: string, outcome: "positive" | "neutral" | "not_interested", note?: string) {
  return tx(async (c) => {
    const e = (await c.query(`select e.*, co.name company from enrollments e join companies co on co.id=e.company_id where e.id=$1 and e.ds=$2`, [enrollmentId, ctx.ds.id])).rows[0];
    if (!e) throw new Error("Not found");
    await c.query("update enrollments set status='replied', stopped_at=now(), stop_reason='Reply received', reply_outcome=$2 where id=$1", [enrollmentId, outcome]);
    await c.query("update outreach_steps set status='skipped' where enrollment_id=$1 and status='pending'", [enrollmentId]);
    await c.query(`insert into activities (id, ds, company_id, contact_id, campaign_id, owner_id, channel, type, outcome, summary, occurred_at)
      select $1,$2,d.company_id,d.contact_id,d.campaign_id,$3,'email','reply',$4,$5,now() from deals d where d.id=$6`,
      [nid(ctx.ds.id, "A"), ctx.ds.id, ctx.me.id, outcome, note || "Reply to sequence email", e.deal_id]);
    const idx = (k: string) => ctx.ds.stages.findIndex((s) => s.key === k);
    if (outcome === "positive" && idx("good_lead") >= 0) {
      await c.query(`update deals set stage='good_lead', furthest_idx=greatest(furthest_idx,$2), updated_at=now(), stage_changed_at=now()
        where id=$1 and furthest_idx < $2 and stage not in ('lost')`, [e.deal_id, idx("good_lead")]);
    } else if (outcome === "not_interested" && idx("lost") >= 0) {
      await c.query("update deals set stage='lost', updated_at=now(), stage_changed_at=now() where id=$1", [e.deal_id]);
    }
    await c.query(`insert into tasks (id, ds, title, details, owner_id, deal_id, company_id, due_date, status, priority, source, created_by)
      values ($1,$2,$3,$4,$5,$6,$7,$8,'todo','high','manual',$9)`,
      [nid(ctx.ds.id, "T"), ctx.ds.id, `Reply from ${e.company}: respond personally`, `Sequence stopped on reply (${outcome.replace("_", " ")}). ${note || ""}`.trim(),
       e.owner_id, e.deal_id, e.company_id, istDay(todayOf(ctx.ds)), ctx.me.id]);
    return { ok: true };
  });
}

/** Stop any active sequence for a company (used when a reply or contact switch is logged elsewhere). */
export async function stopForCompany(ctx: Ctx, companyId: string, reason: string, status: "replied" | "stopped", outcome?: string | null) {
  const rows = await q<{ id: string }>("update enrollments set status=$3, stopped_at=now(), stop_reason=$4, reply_outcome=$5 where ds=$1 and company_id=$2 and status in ('active','switch_contact') returning id",
    [ctx.ds.id, companyId, status, reason, outcome || null]);
  if (rows.length) await q("update outreach_steps set status='skipped' where enrollment_id = any($1::text[]) and status='pending'", [rows.map((r) => r.id)]);
  return rows.length;
}

/** Auto-start the default sequence when a proposal is mailed, if the sequence allows it and the deal has none running. */
export async function autoStart(ctx: Ctx, dealId: string) {
  const seq = await one<{ id: string }>("select id from sequences where ds=$1 and auto_start order by created_at limit 1", [ctx.ds.id]);
  if (!seq) return null;
  const has = await one("select id from enrollments where deal_id=$1 and status in ('active','replied')", [dealId]);
  if (has) return null;
  try { return await enroll(ctx, dealId, seq.id); } catch { return null; }
}
