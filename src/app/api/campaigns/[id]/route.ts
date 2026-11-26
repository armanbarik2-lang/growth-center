import { q, one } from "@/lib/db";
import { canEdit } from "@/lib/session";
import { requireCtx, isResp, json, err } from "@/lib/api";

const FIELDS = ["name", "channel", "objective", "audience", "owner_id", "start_at", "end_at", "budget", "spent", "target_deals",
  "target_value", "test", "kpi", "rank"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const { id } = await params;
  const c = await one<{ owner_id: string; rule: Record<string, unknown> }>("select owner_id, rule from campaigns where id=$1 and ds=$2", [id, ctx.ds.id]);
  if (!c) return err("Not found", 404);
  if (!canEdit(ctx, c.owner_id)) return err("Only a head or the owner can edit this campaign", 403);
  const b = await req.json();
  const sets: string[] = []; const vals: unknown[] = [];
  for (const f of FIELDS) if (f in b) { vals.push(b[f] === "" ? null : b[f]); sets.push(`${f}=$${vals.length}`); }
  if (b.pact) { vals.push(JSON.stringify(b.pact)); sets.push(`pact=$${vals.length}`); }
  if (b.rule) { vals.push(JSON.stringify({ ...(c.rule || {}), ...b.rule })); sets.push(`rule=$${vals.length}`); }
  if (!sets.length) return err("Nothing to update");
  vals.push(id);
  await q(`update campaigns set ${sets.join(",")} where id=$${vals.length}`, vals);
  return json({ ok: true });
}
