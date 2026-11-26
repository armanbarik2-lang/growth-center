import { notificationsFor, campaignMetrics } from "@/lib/metrics";
import { requireCtx, isResp, json } from "@/lib/api";

export async function GET() {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const mine = await notificationsFor(ctx.ds, ctx.me.id);
  let items = mine.items;
  if (ctx.me.role === "head") {
    const camps = await campaignMetrics(ctx.ds);
    const flagged = camps.filter((c) => c.status.status === "amber" || c.status.status === "red").map((c) => ({
      kind: c.status.status === "red" ? "overdue" : "due_soon", text: `${c.status.status === "red" ? "Stop line" : "Change line"}: ${c.name}`,
      sub: `${c.status.signal} · ${c.status.action}`, ref: { type: "campaign", id: c.id }, owner_id: c.owner_id }));
    const team = await notificationsFor(ctx.ds, null);
    items = [...flagged, ...items, { kind: "team", text: `Team: ${team.team.overdue_tasks} overdue tasks, ${team.team.silent_leads} silent leads, ${team.team.payments_due} payments due`, sub: "Open Tasks or Pipeline to act", ref: { type: "team", id: "" }, owner_id: null }];
  }
  return json({ items, role: ctx.me.role });
}
