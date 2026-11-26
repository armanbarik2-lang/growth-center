import { q, one, num } from "./db";
import { Dataset, todayOf, weekOf } from "./session";
import { stageIdx, notificationsFor, istDay } from "./metrics";

/** A member's own goals and coordination info. No team cash, no strategy status. */
export async function myWork(ds: Dataset, memberId: string) {
  const today = todayOf(ds), week = weekOf(ds, today);
  const festWeek = weekOf(ds, new Date(ds.fest_start + "T00:00:00+05:30"));
  const weeks = Math.max(1, festWeek - 1);
  const idx = (k: string) => stageIdx(ds, k);
  const gi = idx("good_lead") >= 0 ? idx("good_lead") : idx("contacted");
  const mi = idx("meeting") >= 0 ? idx("meeting") : idx("proposal_sent");
  const ci = idx("called") >= 0 ? idx("called") : idx("contacted");
  const wi = idx(ds.won_stage);
  const signed = ds.stages.filter((s) => s.kind === "won" || s.kind === "post").map((s) => s.key);
  const m = await one<Record<string, unknown>>(`
    select count(*) total,
      count(*) filter (where furthest_idx >= 1) attempted,
      count(*) filter (where furthest_idx >= $3) connected,
      count(*) filter (where stage='call_attempted') not_connected,
      count(*) filter (where furthest_idx >= $4) good_leads,
      count(*) filter (where furthest_idx >= $5) meetings,
      count(*) filter (where stage = any($6::text[])) signed
    from deals where ds=$1 and owner_id=$2`, [ds.id, memberId, ci, gi, mi, signed]);
  const total = num(m?.total);
  const frac = Math.min(1, Math.max(0, week / weeks));
  // personal plan from the GES funnel: every prospect called by the fest; 10% good leads, 5% meetings, 1% signed
  const goals = [
    { label: "Companies called", actual: num(m?.attempted), goal: total, pace: Math.round(total * frac) },
    { label: "Good leads", actual: num(m?.good_leads), goal: Math.round(total * 0.1), pace: +(total * 0.1 * frac).toFixed(1) },
    { label: "Meetings", actual: num(m?.meetings), goal: Math.round(total * 0.05), pace: +(total * 0.05 * frac).toFixed(1) },
    { label: "Deals signed", actual: num(m?.signed), goal: Math.max(1, Math.round(total * 0.01)), pace: +(Math.max(1, total * 0.01) * frac).toFixed(1) },
  ];
  const counts = {
    connected: num(m?.connected), not_connected: num(m?.not_connected), total,
    to_call: total - num(m?.attempted),
  };
  const alerts = await notificationsFor(ds, memberId);
  const sectors = await q(`
    select mb.id, mb.name, mb.role, mb.sector_group,
      (select count(distinct a.company_id) from activities a where a.ds=$1 and a.owner_id=mb.id and a.type in ('call','outreach_sent')) approached,
      (select count(*) from activities a where a.ds=$1 and a.owner_id=mb.id and a.type='meeting_held' and a.occurred_at > $2::timestamptz - interval '14 days') meetings_14d
    from members mb where mb.ds=$1 order by mb.role, mb.name`, [ds.id, today.toISOString()]);
  const meetings = await q(`
    select a.occurred_at, c.name company, c.id company_id, mb.name member, cp.name strategy
    from activities a join companies c on c.id=a.company_id left join members mb on mb.id=a.owner_id left join campaigns cp on cp.id=a.campaign_id
    where a.ds=$1 and a.type='meeting_held' and a.occurred_at <= $2::timestamptz order by a.occurred_at desc limit 12`, [ds.id, today.toISOString()]);
  void wi; void istDay;
  return { week, fest_week: festWeek, goals, counts, alerts: alerts.items, sectors, meetings };
}
