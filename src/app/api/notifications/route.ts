import { notificationsFor, campaignMetrics } from "@/lib/metrics";
import { requireCtx, isResp, json } from "@/lib/api";

export async function GET() {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const mine = await notificationsFor(ctx.ds, ctx.me.id);
  type Item = { kind: string; group?: string; title?: string; badge?: string; text: string; sub: string; ref: { type: string; id: unknown }; owner_id: unknown };
  let items: Item[] = mine.items;
  if (ctx.me.role === "head") {
    const camps = await campaignMetrics(ctx.ds);
    const flagged = camps.filter((c) => c.status.status === "amber" || c.status.status === "red").map((c) => ({
      kind: c.status.status === "red" ? "overdue" : "due_soon", group: "strategy", title: c.name, badge: c.status.status === "red" ? "Stop" : "Change", text: `${c.status.status === "red" ? "Stop line" : "Change line"}: ${c.name}`,
      sub: `${c.status.signal} · ${c.status.action}`, ref: { type: "campaign", id: c.id }, owner_id: c.owner_id }));
    const team = await notificationsFor(ctx.ds, null);
    items = [...flagged, ...items, { kind: "team", group: "team", title: "Team summary", badge: undefined, text: `Team: ${team.team.overdue_tasks} overdue tasks, ${team.team.silent_leads} silent leads, ${team.team.payments_due} payments due`, sub: `${team.team.overdue_tasks} overdue tasks · ${team.team.silent_leads} silent leads · ${team.team.payments_due} payments due`, ref: { type: "team", id: "" }, owner_id: null }];
  }
  return json({ items, role: ctx.me.role });
}
