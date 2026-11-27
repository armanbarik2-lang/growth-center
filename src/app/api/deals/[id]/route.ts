import { q, one, num } from "@/lib/db";
import { canEdit } from "@/lib/session";
import { requireCtx, isResp, json, err, newId } from "@/lib/api";
import { stageIdx } from "@/lib/metrics";
import { autoStart, stopForCompany } from "@/lib/outreach";

type Deal = { id: string; owner_id: string; stage: string; furthest_idx: number; proposed_value: string; confirmed_value: string; company_id: string; contact_id: string | null; campaign_id: string | null };

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const { id } = await params;
  const d = await one<Deal>("select * from deals where id=$1 and ds=$2", [id, ctx.ds.id]);
  if (!d) return err("Not found", 404);
  if (!canEdit(ctx, d.owner_id)) return err("Members can only edit their own deals", 403);
  const b = await req.json();
  const stage = b.stage ?? d.stage;
  const si = stageIdx(ctx.ds, stage);
  if (si < 0) return err("Unknown stage");
  const kind = ctx.ds.stages[si].kind;
  const proposed = b.proposed_value !== undefined ? Number(b.proposed_value) : num(d.proposed_value);
  let confirmed = b.confirmed_value !== undefined ? Number(b.confirmed_value) : num(d.confirmed_value);
  if ((kind === "won" || kind === "post") && !confirmed) confirmed = proposed;
  if (kind === "open") confirmed = b.confirmed_value !== undefined ? Number(b.confirmed_value) : 0;
  const furthest = kind === "exit" ? d.furthest_idx : Math.max(d.furthest_idx, si);
  const owner = ctx.me.role === "head" && b.owner_id ? b.owner_id : d.owner_id;
  const stageChanged = stage !== d.stage;
  await q(`update deals set stage=$1, proposed_value=$2, confirmed_value=$3, furthest_idx=$4, owner_id=$5,
    package=coalesce($6, package), support_type=coalesce($7, support_type), updated_at=now(),
    stage_changed_at = case when $8 then now() else stage_changed_at end where id=$9`,
    [stage, proposed, confirmed, furthest, owner, b.package ?? null, b.support_type ?? null, stageChanged, id]);
  await q("insert into deal_history (id, ds, deal_id, stage, proposed_value, confirmed_value, owner_id, changed_by) values ($1,$2,$3,$4,$5,$6,$7,$8)",
    [newId(ctx.ds.id, "H"), ctx.ds.id, id, stage, proposed, confirmed, owner, ctx.me.id]);
  if (stageChanged) {
    await q(`insert into activities (id, ds, company_id, contact_id, campaign_id, owner_id, channel, type, outcome, summary, occurred_at)
      values ($1,$2,$3,$4,$5,$6,'app','stage_change',$7,$8,now())`,
      [newId(ctx.ds.id, "A"), ctx.ds.id, d.company_id, d.contact_id, d.campaign_id, owner, stage, `Stage moved from ${d.stage} to ${stage} by ${ctx.me.name}`]);
  }
  if (stageChanged && stage === "proposal_mailed") await autoStart(ctx, id);
  if (stageChanged && (kind === "exit" || kind === "won")) await stopForCompany(ctx, d.company_id, kind === "won" ? "Deal signed" : `Moved to ${stage}`, "stopped");
  // first time signed in the simulated plan: create the standard 50/50 payment schedule and deliverables
  if (stageChanged && kind === "won" && ctx.ds.simulated) {
    const has = await one<{ n: number }>("select count(*)::int n from payments where deal_id=$1", [id]);
    if (!has?.n) {
      const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      await q("insert into payments (id, ds, deal_id, kind, amount, due_date, status, note) values ($1,$2,$3,'advance',$4,$5,'due','50% advance'),($6,$2,$3,'balance',$4,$7,'due','50% after branding report')",
        [newId(ctx.ds.id, "PAY"), ctx.ds.id, id, confirmed / 2, due, newId(ctx.ds.id, "PAY"), "2027-02-10"]);
      for (const item of ["Logo on website and posters", "Stall at the fest", "3 social media posts", "Branding report sent"]) {
        await q("insert into deliverables (id, ds, deal_id, item, status, due_date) values ($1,$2,$3,$4,'pending',$5)",
          [newId(ctx.ds.id, "DL"), ctx.ds.id, id, item, item.startsWith("Branding") ? "2027-01-31" : "2027-01-20"]);
      }
    }
  }
  return json({ ok: true });
}
