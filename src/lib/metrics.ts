import { q, one, num } from "./db";
import { Dataset, Stage, todayOf, weekOf } from "./session";

/* ---------- stage helpers ---------- */
export function stageIdx(ds: Dataset, key: string) { return ds.stages.findIndex((s) => s.key === key); }
export function wonIdx(ds: Dataset) { return stageIdx(ds, ds.won_stage); }
export function signedKeys(ds: Dataset) { return ds.stages.filter((s) => s.kind === "won" || s.kind === "post").map((s) => s.key); }
export function openKeys(ds: Dataset) { return ds.stages.filter((s) => s.kind === "open").map((s) => s.key); }
export function exitKeys(ds: Dataset) { return ds.stages.filter((s) => s.kind === "exit").map((s) => s.key); }
export function goodLeadIdx(ds: Dataset) {
  // "conversation" stage: GEF good_lead; CampusFest has no such stage, use contacted
  const i = stageIdx(ds, "good_lead"); return i >= 0 ? i : stageIdx(ds, "contacted");
}
export function meetingIdx(ds: Dataset) { const i = stageIdx(ds, "meeting"); return i >= 0 ? i : stageIdx(ds, "proposal_sent"); }
export function sanctionIdx(ds: Dataset) { const i = stageIdx(ds, "negotiation"); return i >= 0 ? i : stageIdx(ds, "negotiating"); }

const CONTACT_TYPES = ["outreach_sent", "call", "introduction_received", "web_inbound"];
const RESPONSE_SQL = `(a.type in ('introduction_received','web_inbound','meeting_booked','meeting_held')
  or (a.type in ('replied','reply') and a.outcome in ('positive','neutral')))`;

export type Status = { status: "green" | "amber" | "red" | "testing"; signal: string; detail: string; action: string };

export type CampaignRow = {
  id: string; name: string; kind: string; channel: string | null; owner_id: string | null; owner_name: string | null;
  rank: number | null; pact: { p: number; a: number; c: number; t: number } | null; pact_score: number | null;
  budget: number | null; spent: number | null; start_at: string | null; end_at: string | null;
  target_deals: number | null; target_value: number | null; test: string | null; kpi: string | null; rule: Record<string, unknown> | null;
  pays_after_fest: boolean; objective: string | null; audience: string | null;
  listed: number; contacted: number; attempts: number; responded: number; meetings: number;
  sends: number; bounces: number; replies: number;
  deals_total: number; deals_open: number; signed: number; signed_value: number; signed_cash: number; lost: number;
  pipeline_value: number; weighted_value: number; good_leads: number; meetings_reached: number; sanction_reached: number;
  contacted_first_n: number; good_leads_first_n: number; meetings_first_n: number;
  win_rate: number | null; response_rate: number | null; cost_per_signed: number | null;
  status: Status;
};

/** True once the dataset's "today" is past the last fest day (end of day, IST): open deals can no longer pay before the fest. */
export function festOver(ds: Dataset, today = todayOf(ds)) {
  return today.getTime() > new Date((ds.fest_end || ds.fest_start) + "T23:59:59+05:30").getTime();
}

export function istDay(d: Date) { return new Date(d.getTime() + 19800000).toISOString().slice(0, 10); }
function fmtL(v: number) { return `₹${(v / 100000).toFixed(v >= 1000000 ? 1 : 2)}L`; }

/* ---------- campaign metrics ---------- */
export async function campaignMetrics(ds: Dataset, ownerId?: string | null): Promise<CampaignRow[]> {
  const G = goodLeadIdx(ds), M = meetingIdx(ds), S = sanctionIdx(ds);
  const signed = signedKeys(ds), open = openKeys(ds), exits = exitKeys(ds);
  const prob = ds.stage_prob || {};
  const probCase = `case d.stage ${Object.entries(prob).filter(([, v]) => v !== null).map(([k, v]) => `when '${k}' then ${Number(v)}`).join(" ")} else 0 end`;
  const ownerFilter = ownerId ? "and d.owner_id = $2" : "";
  const aOwner = ownerId ? "and a.owner_id = $2" : "";
  const params: unknown[] = ownerId ? [ds.id, ownerId] : [ds.id];
  const rows = await q<Record<string, unknown>>(`
    with c as (select c.*, m.name owner_name from campaigns c left join members m on m.id=c.owner_id where c.ds=$1),
    act as (
      select a.campaign_id,
        count(distinct a.company_id) filter (where a.type = any($${params.length + 1}::text[])) contacted,
        count(distinct coalesce(a.attempt_id, a.company_id)) filter (where a.type = any($${params.length + 1}::text[])) attempts,
        count(distinct a.company_id) filter (where ${RESPONSE_SQL}) responded,
        count(distinct a.company_id) filter (where a.type='meeting_held') meetings,
        coalesce(sum(a.qty) filter (where a.type='email_burst'),0) sends,
        coalesce(sum(a.qty) filter (where a.type='bounced'),0) bounces,
        count(*) filter (where a.campaign_id is not null and a.type in ('reply','replied')) replies
      from activities a where a.ds=$1 ${aOwner} group by a.campaign_id),
    dl as (
      select d.campaign_id, count(*) deals_total,
        count(*) filter (where d.stage = any($${params.length + 2}::text[])) deals_open,
        count(*) filter (where d.stage = any($${params.length + 3}::text[])) signed,
        coalesce(sum(d.confirmed_value) filter (where d.stage = any($${params.length + 3}::text[])),0) signed_value,
        coalesce(sum(d.confirmed_value) filter (where d.stage = any($${params.length + 3}::text[]) and d.support_type='cash'),0) signed_cash,
        count(*) filter (where d.stage = any($${params.length + 4}::text[])) lost,
        coalesce(sum(d.proposed_value) filter (where d.stage = any($${params.length + 2}::text[])),0) pipeline_value,
        coalesce(sum(d.proposed_value * ${probCase}) filter (where d.stage = any($${params.length + 2}::text[])),0) weighted_value,
        count(*) filter (where d.furthest_idx >= ${G}) good_leads,
        count(*) filter (where d.furthest_idx >= ${M}) meetings_reached,
        count(*) filter (where d.furthest_idx >= ${S}) sanction_reached
      from deals d where d.ds=$1 ${ownerFilter} group by d.campaign_id),
    listed as (select campaign_id, count(*) n from companies where ds=$1 ${ownerId ? "and owner_id=$2" : ""} group by campaign_id)
    select c.*, coalesce(l.n,0) listed, coalesce(act.contacted,0) contacted, coalesce(act.attempts,0) attempts,
      coalesce(act.responded,0) responded, coalesce(act.meetings,0) meetings, coalesce(act.sends,0) sends,
      coalesce(act.bounces,0) bounces, coalesce(act.replies,0) replies,
      coalesce(dl.deals_total,0) deals_total, coalesce(dl.deals_open,0) deals_open, coalesce(dl.signed,0) signed,
      coalesce(dl.signed_value,0) signed_value, coalesce(dl.signed_cash,0) signed_cash, coalesce(dl.lost,0) lost,
      coalesce(dl.pipeline_value,0) pipeline_value, coalesce(dl.weighted_value,0) weighted_value,
      coalesce(dl.good_leads,0) good_leads, coalesce(dl.meetings_reached,0) meetings_reached, coalesce(dl.sanction_reached,0) sanction_reached
    from c left join act on act.campaign_id=c.id left join dl on dl.campaign_id=c.id left join listed l on l.campaign_id=c.id
    order by c.kind='base' desc, c.rank nulls last, c.name`,
    [...params, CONTACT_TYPES, open, signed, exits]);

  // first-N tests (by first contact time)
  const firstN = await q<Record<string, unknown>>(`
    with fc as (
      select d.campaign_id, d.id, d.furthest_idx,
        (select min(a.occurred_at) from activities a where a.ds=$1 and a.company_id=d.company_id and a.type = any($2::text[])) first_at
      from deals d where d.ds=$1),
    ranked as (select *, row_number() over (partition by campaign_id order by first_at) rn from fc where first_at is not null)
    select r.campaign_id, (c.rule->>'n')::int n,
      count(*) filter (where rn <= (c.rule->>'n')::int) contacted_first_n,
      count(*) filter (where rn <= (c.rule->>'n')::int and furthest_idx >= ${G}) good_leads_first_n,
      count(*) filter (where rn <= (c.rule->>'n')::int and furthest_idx >= ${M}) meetings_first_n
    from ranked r join campaigns c on c.id=r.campaign_id where c.rule ? 'n' group by r.campaign_id, c.rule`, [ds.id, CONTACT_TYPES]);
  const fmap = new Map(firstN.map((r) => [r.campaign_id as string, r]));

  const today = todayOf(ds), week = weekOf(ds, today);
  const over = festOver(ds, today);
  const allContacted = rows.reduce((s, r) => s + num(r.contacted), 0);
  const allSigned = rows.reduce((s, r) => s + num(r.signed), 0);
  const overallRate = allContacted ? allSigned / allContacted : 0;

  const teamStatus = ownerId ? new Map((await campaignMetrics(ds, null)).map((c) => [c.id, c.status])) : null;
  return rows.map((r) => {
    const f = fmap.get(r.id as string) || {};
    const pact = (r.pact as CampaignRow["pact"]) || null;
    const row: CampaignRow = {
      id: r.id as string, name: r.name as string, kind: r.kind as string, channel: r.channel as string,
      owner_id: r.owner_id as string, owner_name: r.owner_name as string, rank: r.rank as number | null, pact,
      pact_score: pact ? pact.p * pact.a * pact.c * pact.t : null,
      budget: r.budget === null ? null : num(r.budget), spent: r.spent === null ? null : num(r.spent),
      start_at: r.start_at as string, end_at: r.end_at as string,
      target_deals: r.target_deals === null ? null : num(r.target_deals), target_value: r.target_value === null ? null : num(r.target_value),
      test: r.test as string, kpi: r.kpi as string, rule: r.rule as Record<string, unknown>, pays_after_fest: !!r.pays_after_fest,
      objective: r.objective as string, audience: r.audience as string,
      listed: num(r.listed), contacted: num(r.contacted), attempts: num(r.attempts), responded: num(r.responded), meetings: num(r.meetings),
      sends: num(r.sends), bounces: num(r.bounces), replies: num(r.replies),
      deals_total: num(r.deals_total), deals_open: num(r.deals_open), signed: num(r.signed), signed_value: num(r.signed_value),
      signed_cash: num(r.signed_cash), lost: num(r.lost), pipeline_value: num(r.pipeline_value), weighted_value: over ? 0 : num(r.weighted_value),
      good_leads: num(r.good_leads), meetings_reached: num(r.meetings_reached), sanction_reached: num(r.sanction_reached),
      contacted_first_n: num(f.contacted_first_n), good_leads_first_n: num(f.good_leads_first_n), meetings_first_n: num(f.meetings_first_n),
      win_rate: null, response_rate: null, cost_per_signed: null,
      status: { status: "testing", signal: "", detail: "", action: "" },
    };
    row.win_rate = row.contacted ? row.signed / row.contacted : null;
    row.response_rate = row.contacted ? row.responded / row.contacted : null;
    row.cost_per_signed = row.spent && row.signed ? row.spent / row.signed : null;
    row.status = teamStatus?.get(row.id) || evalRule(row, week, overallRate);
    return row;
  });
}

/* ---------- scale / change / stop rules ---------- */
export function evalRule(r: CampaignRow, week: number, overallRate: number): Status {
  const rule = (r.rule || {}) as Record<string, number | string>;
  const t = rule.type;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  if (t === "base") {
    const prospects = Number(rule.prospects) || 1000, weeks = Number(rule.weeks) || 12;
    const pace = Math.min(prospects, Math.round((prospects * Math.max(0, week)) / weeks));
    const ratio = pace ? r.contacted / pace : 1;
    const st = ratio >= 0.9 ? "green" : ratio >= 0.6 ? "amber" : "red";
    return { status: st, signal: `${r.contacted} of ${pace} calls due by week ${week}`, detail: `${r.signed} signed, ${r.good_leads} good leads`,
      action: st === "green" ? "Keep the calling pace" : "Re-balance calls across members; heads take overflow" };
  }
  if (t === "deal_by_week") {
    if (r.signed >= Number(rule.min_deals || 1)) return { status: "green", signal: `${r.signed} deal(s) signed`, detail: `test: 1 deal by week ${rule.week}`, action: "Scale: keep the weekly volume" };
    if (week < Number(rule.week)) return { status: "testing", signal: `0 deals so far, week ${week} of ${rule.week}`, detail: `${r.contacted} contacted`, action: "Keep testing" };
    return { status: "amber", signal: `No deal by week ${rule.week}`, detail: `${r.contacted} contacted`, action: String(rule.change_action || "Change approach") };
  }
  if (t === "leads_per_n") {
    const n = Number(rule.n), g = Number(rule.green);
    if (r.contacted_first_n < n) return { status: "testing", signal: `${r.good_leads_first_n} good leads from first ${r.contacted_first_n} contacted (test at ${n})`, detail: "", action: "Keep testing" };
    if (r.good_leads_first_n >= g) return { status: "green", signal: `${r.good_leads_first_n} good leads per ${n}`, detail: `scale line ${g}+`, action: "Scale: add a scout" };
    return { status: "amber", signal: `${r.good_leads_first_n} good leads per ${n} (under ${g})`, detail: "", action: String(rule.change_action) };
  }
  if (t === "meetings_per_n") {
    const n = Number(rule.n), g = Number(rule.green), stopAfter = Number(rule.stop_after);
    if (r.meetings_reached === 0 && r.contacted >= stopAfter) return { status: "red", signal: `0 meetings after ${r.contacted} units`, detail: "", action: String(rule.stop_action) };
    if (r.contacted_first_n < n) return { status: "testing", signal: `${r.meetings_first_n} meetings from first ${r.contacted_first_n} units (test at ${n})`, detail: "", action: "Keep testing" };
    if (r.meetings_first_n >= g) return { status: "green", signal: `${r.meetings_first_n} meetings per ${n} units`, detail: "", action: "Scale: map more groups" };
    return { status: "amber", signal: `${r.meetings_first_n} meeting(s) per ${n} units (scale line ${g}+)`, detail: "", action: String(rule.change_action) };
  }
  if (t === "title") {
    if (r.signed > 0) return { status: week <= Number(rule.green_week) ? "green" : "green", signal: `${r.signed} title signed`, detail: "", action: "Scale: offer a second title" };
    if (week >= Number(rule.meeting_week) && r.meetings_reached === 0) return { status: "red", signal: `No meeting by week ${rule.meeting_week}`, detail: "", action: String(rule.stop_action) };
    if (week >= Number(rule.green_week) && r.meetings_reached > 0) return { status: "amber", signal: `Meeting but no signature by week ${rule.green_week}`, detail: "", action: String(rule.change_action) };
    return { status: "testing", signal: `${r.meetings_reached} meeting(s), week ${week}`, detail: `test: signed by week ${rule.signal_week}`, action: "Keep testing" };
  }
  if (t === "gov") {
    const convOk = r.good_leads >= Number(rule.conv_min), sanOk = r.sanction_reached >= 1;
    if (week < Number(rule.conv_week)) return { status: "testing", signal: `${r.good_leads} conversation(s) so far`, detail: `test at week ${rule.conv_week}`, action: "Keep testing" };
    if (week < Number(rule.sanction_week)) return convOk
      ? { status: "green", signal: `${r.good_leads} conversations by week ${week}`, detail: "proposal-in-sanction test at week 6", action: "Push 1 proposal into sanction" }
      : { status: "amber", signal: `${r.good_leads} conversation(s), needed ${rule.conv_min} by week ${rule.conv_week}`, detail: "", action: String(rule.change_action) };
    if (convOk && sanOk) return { status: "green", signal: `Both tests met`, detail: `${r.good_leads} conversations, ${r.sanction_reached} in sanction`, action: "Scale" };
    if (convOk || sanOk) return { status: "amber", signal: `One of two tests met`, detail: `${r.good_leads} conversations, ${r.sanction_reached} in sanction`, action: String(rule.change_action) };
    return { status: "red", signal: `Neither test met by week ${rule.sanction_week}`, detail: "", action: String(rule.stop_action) };
  }
  if (t === "reply_rate") {
    if (!r.sends) return { status: "testing", signal: "No sends yet", detail: "", action: "Send first burst" };
    const rr = r.replies / r.sends, br = r.bounces / r.sends;
    if (br > Number(rule.red_bounce)) return { status: "red", signal: `Bounce rate ${pct(br)}`, detail: `reply rate ${pct(rr)}`, action: "Stop: fix the list before the next burst" };
    if (rr >= Number(rule.green)) return { status: "green", signal: `Reply rate ${pct(rr)}`, detail: `${r.replies} replies / ${r.sends} sends`, action: "Scale: bigger bursts" };
    return { status: "amber", signal: `Reply rate ${pct(rr)} (scale line 0.5%)`, detail: `${r.replies} replies / ${r.sends} sends, bounce ${pct(br)}`, action: String(rule.change_action) };
  }
  // CampusFest default rule (Growth Center rule, not from the source data)
  if (r.contacted < 20 && r.signed === 0) return { status: "testing", signal: `${r.contacted} brands contacted`, detail: "Rule: compare at 20+ brands", action: "Keep testing" };
  const rate = r.contacted ? r.signed / r.contacted : 0;
  if (r.signed === 0) return { status: "red", signal: `0 confirmed from ${r.contacted} brands`, detail: `team average ${pct(overallRate)}`, action: "Stop or rework: move effort to warm channels" };
  if (rate >= overallRate) return { status: "green", signal: `${pct(rate)} of contacted brands confirmed`, detail: `team average ${pct(overallRate)}`, action: "Scale" };
  return { status: "amber", signal: `${pct(rate)} confirmed (below team ${pct(overallRate)})`, detail: "", action: "Change: tighten targeting or follow-ups" };
}

/* ---------- dashboard ---------- */
export async function dashboard(ds: Dataset, ownerId?: string | null) {
  const today = todayOf(ds), week = weekOf(ds, today);
  const signed = signedKeys(ds), open = openKeys(ds);
  const params: unknown[] = ownerId ? [ds.id, ownerId] : [ds.id];
  const of = ownerId ? "and d.owner_id=$2" : "";
  const campaigns = await campaignMetrics(ds, ownerId);

  const k = await one<Record<string, unknown>>(`
    select
      count(*) filter (where d.stage = any($${params.length + 1}::text[])) signed_deals,
      count(*) filter (where d.stage = any($${params.length + 1}::text[]) and d.support_type<>'cash') signed_inkind_deals,
      coalesce(sum(d.confirmed_value) filter (where d.stage = any($${params.length + 1}::text[]) and d.support_type='cash'),0) signed_cash,
      coalesce(sum(d.confirmed_value) filter (where d.stage = any($${params.length + 1}::text[]) and d.support_type<>'cash'),0) signed_inkind,
      count(*) filter (where d.stage = any($${params.length + 2}::text[])) open_deals,
      coalesce(sum(d.proposed_value) filter (where d.stage = any($${params.length + 2}::text[])),0) open_value
    from deals d where d.ds=$1 ${of}`, [...params, signed, open]);
  const pay = await one<Record<string, unknown>>(`
    select count(*) n,
      coalesce(sum(p.amount) filter (where p.status='paid'),0) collected,
      coalesce(sum(p.amount) filter (where p.status='paid' and p.paid_at < $${params.length + 1}::date),0) collected_before_fest,
      coalesce(sum(p.amount) filter (where p.status='due' and p.due_date < $${params.length + 1}::date),0) due_before_fest,
      coalesce(sum(p.amount) filter (where p.status='due' and p.due_date < $${params.length + 2}::date),0) overdue,
      coalesce(sum(p.amount) filter (where p.status='due' and p.due_date >= $${params.length + 1}::date),0) due_after_fest,
      coalesce(sum(p.amount) filter (where p.status='written_off'),0) written_off
    from payments p join deals d on d.id=p.deal_id where p.ds=$1 ${of}`, [...params, ds.fest_start, istDay(today)]);

  const weighted = campaigns.reduce((s, c) => s + c.weighted_value, 0);
  const weightedFast = campaigns.filter((c) => !c.pays_after_fest).reduce((s, c) => s + c.weighted_value, 0);
  const anyPay = await one<Record<string, unknown>>("select count(*)::int n from payments where ds=$1", [ds.id]);
  const hasPayments = num(anyPay?.n) > 0;
  const BEFORE_SHARE = 0.55; // deck: 50% advance + 50% x 10% upfront payers (base end)
  const contracted = num(pay?.collected_before_fest) + num(pay?.due_before_fest);
  const pipelinePart = weightedFast * BEFORE_SHARE;
  const projectedBefore = hasPayments ? contracted + pipelinePart : null;
  // plan rate = odds of signing for an untouched prospect; observed = signed so far / companies contacted so far
  const firstOpen = ds.stages.find((s) => s.kind === "open")?.key || "";
  const planRate = Number((ds.stage_prob || {})[firstOpen]) || null;
  const contactedAll = campaigns.reduce((s, c) => s + c.contacted, 0), signedAll = campaigns.reduce((s, c) => s + c.signed, 0);
  const observedRate = contactedAll ? signedAll / contactedAll : null;
  const atObserved = hasPayments && planRate && observedRate !== null ? contracted + pipelinePart * Math.min(1, observedRate / planRate) : null;
  const over = festOver(ds, today);

  // targets (latest version effective by today)
  const targets = await q<Record<string, unknown>>(`select * from targets where ds=$1 order by effective_at, id`, [ds.id]);
  const effective = targets.filter((t) => new Date(t.effective_at as string) <= today);
  const latestAt = effective.length ? Math.max(...effective.map((t) => new Date(t.effective_at as string).getTime())) : 0;
  const activeTargets = effective.filter((t) => new Date(t.effective_at as string).getTime() === latestAt);
  const superseded = effective.filter((t) => new Date(t.effective_at as string).getTime() < latestAt)
    .map((t) => ({ version: t.version as string, effective_at: t.effective_at as string, replaced_at: new Date(latestAt).toISOString(),
      deals_goal: t.deals_goal === null ? null : num(t.deals_goal), qualified_goal: t.qualified_goal === null ? null : num(t.qualified_goal) }));
  const qualified = await one<Record<string, unknown>>(`select count(*) filter (where qualification='qualified') n from companies where ds=$1 ${ownerId ? "and owner_id=$2" : ""}`, params);

  // reached-stage funnel
  const funnel = await q<Record<string, unknown>>(`
    select s.idx, count(d.id) filter (where d.furthest_idx >= s.idx) reached
    from generate_series(0, $2::int) s(idx) left join deals d on d.ds=$1 ${ownerId ? "and d.owner_id=$3" : ""}
    group by s.idx order by s.idx`, ownerId ? [ds.id, wonIdx(ds), ownerId] : [ds.id, wonIdx(ds)]);
  const funnelRows = funnel.map((f) => ({ key: ds.stages[num(f.idx)].key, label: ds.stages[num(f.idx)].funnel_label || ds.stages[num(f.idx)].label, reached: num(f.reached) }));

  // outreach funnel from activities
  const ofn = await one<Record<string, unknown>>(`
    select (select count(*) from companies where ds=$1 ${ownerId ? "and owner_id=$2" : ""}) listed,
      count(distinct a.company_id) filter (where a.type = any($${params.length + 1}::text[])) contacted,
      count(distinct a.company_id) filter (where ${RESPONSE_SQL}) responded,
      count(distinct a.company_id) filter (where a.type='meeting_held') meetings
    from activities a where a.ds=$1 ${ownerId ? "and a.owner_id=$2" : ""}`, [...params, CONTACT_TYPES]);

  // weekly signed trend (first time a deal reached won stage)
  const trend = await q<Record<string, unknown>>(`
    with first_won as (
      select h.deal_id, min(h.effective_at) at from deal_history h join deals d on d.id=h.deal_id
      where h.ds=$1 and h.stage = any($2::text[]) ${ownerId ? "and d.owner_id=$4" : ""} group by h.deal_id),
    cur as (select id, confirmed_value, support_type from deals where ds=$1 and stage = any($2::text[]))
    select floor(extract(epoch from (fw.at - $3::date)) / 604800)::int + 1 wk, count(*) n, coalesce(sum(cur.confirmed_value),0) v
    from first_won fw join cur on cur.id=fw.deal_id group by 1 order by 1`,
    ownerId ? [ds.id, signed, ds.outreach_start, ownerId] : [ds.id, signed, ds.outreach_start]);

  const festWeek = weekOf(ds, new Date(ds.fest_start + "T00:00:00+05:30"));
  const lastWeek = Math.max(1, Math.min(week, festWeek + 1));
  const goal = activeTargets.length ? activeTargets[activeTargets.length - 1] : null;
  let cumN = 0, cumV = 0;
  const weekly = [] as { week: number; signed: number; value: number; goal_pace: number | null }[];
  const tmap = new Map(trend.map((t) => [num(t.wk), t]));
  const minWeek = Math.min(1, ...trend.map((t) => num(t.wk)));
  for (let w = minWeek; w <= lastWeek; w++) {
    const t = tmap.get(w); cumN += num(t?.n); cumV += num(t?.v);
    if (w === lastWeek) for (const [wk, x] of tmap) if (wk > lastWeek) { cumN += num(x.n); cumV += num(x.v); }
    weekly.push({ week: w, signed: cumN, value: cumV, goal_pace: goal && num(goal.deals_goal) ? +(num(goal.deals_goal) * Math.min(1, Math.max(0, w) / Math.max(1, festWeek - 1))).toFixed(1) : null });
  }

  const elapsed = Math.min(1, Math.max(0, (week) / Math.max(1, festWeek - 1)));
  const targetRows = activeTargets.map((t) => ({
    version: t.version as string, effective_at: t.effective_at as string, note: t.note as string,
    items: [
      t.deals_goal !== null ? { label: "Signed deals", goal: num(t.deals_goal), actual: num(k?.signed_deals), pace: +(num(t.deals_goal) * elapsed).toFixed(1) } : null,
      t.qualified_goal !== null && !ds.simulated ? { label: "Qualified brands", goal: num(t.qualified_goal), actual: num(qualified?.n), pace: +(num(t.qualified_goal) * elapsed).toFixed(1) } : null,
      t.signed_value_goal !== null ? { label: "Signed cash (₹)", goal: num(t.signed_value_goal), actual: num(k?.signed_cash), pace: Math.round(num(t.signed_value_goal) * elapsed) } : null,
      t.before_fest_goal !== null ? { label: "Cash before fest (₹, projected)", goal: num(t.before_fest_goal), actual: projectedBefore === null ? null : Math.round(projectedBefore), pace: null } : null,
    ].filter(Boolean),
  }));

  // bottleneck: biggest stage-to-stage drop vs previous stage (open part of funnel)
  const steps = funnelRows.slice(1).map((f, i) => ({ from: funnelRows[i].label, to: f.label, rate: funnelRows[i].reached >= 5 ? f.reached / funnelRows[i].reached : null }));
  const notifications = await notificationsFor(ds, null);

  return {
    dataset: { id: ds.id, name: ds.name, simulated: ds.simulated, as_of: ds.as_of, fest_start: ds.fest_start, outreach_start: ds.outreach_start, prob_source: ds.prob_source, stage_prob: ds.stage_prob },
    today: today.toISOString(), week, fest_week: festWeek,
    kpis: {
      signed_deals: num(k?.signed_deals), signed_cash: num(k?.signed_cash), signed_inkind: num(k?.signed_inkind),
      signed_split: `${num(k?.signed_deals)} signed in total = ${num(k?.signed_deals) - num(k?.signed_inkind_deals)} cash deals (signed_cash) + ${num(k?.signed_inkind_deals)} in-kind deals (signed_inkind). Do not add these together again.`,
      open_deals: num(k?.open_deals), open_value: num(k?.open_value), weighted_pipeline: Math.round(weighted),
      projected_signed_cash: Math.round(num(k?.signed_cash) + weighted),
      collected: hasPayments ? num(pay?.collected) : null, due_before_fest: hasPayments ? num(pay?.due_before_fest) : null,
      overdue: hasPayments ? num(pay?.overdue) : null, projected_before_fest: projectedBefore === null ? null : Math.round(projectedBefore),
      payments_note: hasPayments ? `Projected = collected before fest + payments due before fest + ${Math.round(BEFORE_SHARE * 100)}% of weighted pipeline in fast-paying bets` : "This dataset has no payment records, so cash collected cannot be measured.",
      before_fest_breakdown: hasPayments ? {
        contracted: Math.round(contracted), collected_before_fest: num(pay?.collected_before_fest), due_before_fest: num(pay?.due_before_fest),
        expected_from_pipeline_at_plan_rates: Math.round(pipelinePart), share_of_pipeline_paid_before_fest: BEFORE_SHARE,
        plan_signing_rate_untouched_prospect: planRate, observed_signing_rate_so_far: observedRate === null ? null : +observedRate.toFixed(4),
        observed_basis: `${signedAll} signed of ${contactedAll} companies contacted`,
        projected_at_observed_rate: atObserved === null ? null : Math.round(atObserved),
        note: "Plan rates are assumptions [A]. The observed rate is early in the campaign, so it is biased low: deals contacted recently have not had time to sign.",
      } : null,
      fest_over: over,
      fest_over_note: over ? "The fest is over at this snapshot: open deals can no longer bring cash before the fest, so the weighted pipeline is 0." : null,
      budget: campaigns.reduce((s, c) => s + (c.budget || 0), 0) || null, spent: campaigns.reduce((s, c) => s + (c.spent || 0), 0) || null,
    },
    funnel: funnelRows, steps,
    outreach: { listed: num(ofn?.listed), contacted: num(ofn?.contacted), responded: num(ofn?.responded), meetings: num(ofn?.meetings) },
    weekly, targets: targetRows, superseded_targets: superseded, campaigns,
    alerts: notifications.team,
  };
}

/* ---------- notifications ---------- */
export async function notificationsFor(ds: Dataset, memberId: string | null) {
  const today = todayOf(ds);
  const d0 = istDay(today);
  const p = memberId ? [ds.id, d0, memberId] : [ds.id, d0];
  const tasks = await q<Record<string, unknown>>(`
    select t.id, t.title, to_char(t.due_date, 'DD Mon') due, t.source, t.priority, t.status, m.name owner_name, t.owner_id,
      case when t.due_date < $2::date then 'overdue' when t.due_date <= $2::date + 2 then 'due_soon' else 'later' end bucket
    from tasks t left join members m on m.id=t.owner_id
    where t.ds=$1 and t.status <> 'done' ${memberId ? "and t.owner_id=$3" : ""} and (t.due_date <= $2::date + 2 or (t.source='ai' and t.created_at > $2::date - 7))
    order by t.due_date`, p);
  const silentStages = ds.stages.filter((s) => s.kind === "open" && !["prospect", "prospecting", "called", "call_attempted"].includes(s.key)).map((s) => s.key);
  const silent = await q<Record<string, unknown>>(`
    select d.id, coalesce(c.name, d.name) as name, d.stage, m.name owner_name, d.owner_id, max(a.occurred_at) last_at,
      ($2::date - max(a.occurred_at)::date) days
    from deals d left join activities a on a.company_id=d.company_id and a.ds=d.ds left join members m on m.id=d.owner_id
      left join companies c on c.id=d.company_id
    where d.ds=$1 and d.stage = any($${p.length + 1}::text[]) ${memberId ? "and d.owner_id=$3" : ""}
    group by d.id, m.name, c.name having $2::date - max(a.occurred_at)::date >= 21 order by last_at`, [...p, silentStages]);
  const pays = await q<Record<string, unknown>>(`
    select p.id, p.kind, p.amount, to_char(p.due_date, 'DD Mon') due, coalesce(c.name, d.name) deal, m.name owner_name, d.owner_id,
      case when p.due_date < $2::date then 'overdue' else 'due_soon' end bucket
    from payments p join deals d on d.id=p.deal_id left join members m on m.id=d.owner_id left join companies c on c.id=d.company_id
    where p.ds=$1 and p.status='due' and p.due_date <= $2::date + 7 ${memberId ? "and d.owner_id=$3" : ""} order by p.due_date`, p);
  const notesUnread = memberId ? await q<Record<string, unknown>>(`
    select n.id, n.kind, n.title, n.brief, n.created_at, a.name author_name, n.author_id, c.name company_name
    from notes n left join members a on a.id=n.author_id left join companies c on c.id=n.company_id
    where n.ds=$1 and n.author_id <> $2 and n.kind <> 'remark'
      and not exists (select 1 from note_reads r where r.note_id=n.id and r.member_id=$2)
      and ((select role from members where id=$2)='head' and (n.to_heads ? '*' or n.to_heads ? $2 or n.to_members)
           or (select role from members where id=$2)='member' and n.to_members)
    order by n.created_at desc limit 20`, [ds.id, memberId]) : [];
  const notConnected = memberId ? await one<Record<string, unknown>>(`select count(*)::int n from deals where ds=$1 and owner_id=$2 and stage='call_attempted'`, [ds.id, memberId]) : null;
  const seq = await one<Record<string, unknown>>(`
    select (select count(*) from outreach_steps s join enrollments e on e.id=s.enrollment_id
              where s.ds=$1 and s.status='pending' and e.status='active' and s.due_date <= $2::date ${memberId ? "and e.owner_id=$3" : ""}) due,
           (select count(*) from enrollments e where e.ds=$1 and e.status='switch_contact' ${memberId ? "and e.owner_id=$3" : ""}) switch_needed`, p).catch(() => null);
  const items = [
    ...(num(seq?.due) ? [{ kind: "due_soon", text: `${num(seq?.due)} email or call steps due in your sequences`, sub: "Email sequences, To do today", ref: { type: "outreach", id: "" }, owner_id: memberId }] : []),
    ...(num(seq?.switch_needed) ? [{ kind: "silent", text: `${num(seq?.switch_needed)} sequences ended with no reply: switch contact`, sub: "Email sequences, Need new contact", ref: { type: "outreach", id: "switch" }, owner_id: memberId }] : []),
    ...notesUnread.map((n) => ({ kind: "note", text: `${n.kind === "mom" ? "Meeting notes" : "Update"} from ${n.author_name}: ${n.title}`, sub: String(n.brief || ""), ref: { type: "note", id: n.id }, owner_id: n.author_id })),
    ...(num(notConnected?.n) ? [{ kind: "due_soon", text: `${num(notConnected?.n)} companies not connected: find new contacts`, sub: "Pipeline, column 'Not connected'", ref: { type: "stage", id: "call_attempted" }, owner_id: memberId }] : []),
    ...tasks.map((t) => ({ kind: t.source === "ai" && t.bucket === "later" ? "ai_task" : (t.bucket as string), text: `${t.source === "ai" ? "AI task" : "Task"}: ${t.title}`, sub: `${t.owner_name || ""} · due ${t.due}`, ref: { type: "task", id: t.id }, owner_id: t.owner_id })),
    ...silent.slice(0, 50).map((s) => ({ kind: "silent", text: `Silent ${s.days} days: ${s.name}`, sub: `${s.owner_name || ""} · switch contact (3-week rule)`, ref: { type: "deal", id: s.id }, owner_id: s.owner_id })),
    ...pays.map((x) => ({ kind: x.bucket as string, text: `${x.kind === "full" ? "Full payment" : x.kind === "advance" ? "50% advance" : "50% balance"} ${fmtL(num(x.amount))}: ${x.deal}`, sub: `${x.owner_name || ""} · due ${x.due}`, ref: { type: "payment", id: x.id }, owner_id: x.owner_id })),
  ];
  return { items, unread_notes: notesUnread.length, team: { overdue_tasks: tasks.filter((t) => t.bucket === "overdue").length, silent_leads: silent.length, payments_due: pays.length } };
}

export function stageLabel(ds: Dataset, key: string) { return ds.stages.find((s: Stage) => s.key === key)?.label || key; }
