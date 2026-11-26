import { q, one } from "@/lib/db";
import { canEdit } from "@/lib/session";
import { requireCtx, isResp, json, err, newId } from "@/lib/api";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const { id } = await params;
  const s = await one<Record<string, string>>(`select s.*, e.owner_id, e.deal_id, e.company_id, e.contact_id, e.status estatus, d.stage, d.campaign_id
    from outreach_steps s join enrollments e on e.id=s.enrollment_id left join deals d on d.id=e.deal_id where s.id=$1 and s.ds=$2`, [id, ctx.ds.id]);
  if (!s) return err("Not found", 404);
  if (!canEdit(ctx, s.owner_id)) return err("Members can only work their own sequences", 403);
  const b = await req.json();
  if (b.action === "save") {
    await q("update outreach_steps set subject=coalesce($1,subject), body=coalesce($2,body) where id=$3", [b.subject ?? null, b.body ?? null, id]);
    return json({ ok: true });
  }
  if (s.estatus !== "active") return err("This sequence is no longer active");
  if (b.action === "skip") { await q("update outreach_steps set status='skipped', done_at=now() where id=$1", [id]); return json({ ok: true }); }
  const isEmail = s.type === "email";
  await q("update outreach_steps set status=$1, outcome=$2, done_at=now(), subject=coalesce($3,subject), body=coalesce($4,body) where id=$5",
    [isEmail ? "sent" : "done", isEmail ? null : b.outcome || "connected", b.subject ?? null, b.body ?? null, id]);
  const type = isEmail ? (Number(s.step_no) === 1 ? "proposal_mailed" : "follow_up_email") : "follow_up_call";
  await q(`insert into activities (id, ds, company_id, contact_id, campaign_id, owner_id, channel, type, outcome, summary, occurred_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())`,
    [newId(ctx.ds.id, "A"), ctx.ds.id, s.company_id, s.contact_id, s.campaign_id, ctx.me.id, isEmail ? "email" : "call", type,
     isEmail ? "sent" : b.outcome || "connected", `Sequence step ${s.step_no}: ${s.subject}`]);
  // keep the deal stage in step with the sequence (simulated plan stages)
  const idx = (k: string) => ctx.ds.stages.findIndex((x) => x.key === k);
  const target = Number(s.step_no) === 1 ? "proposal_mailed" : "follow_up";
  if (idx(target) >= 0 && ["prospect", "call_attempted", "called", "proposal_mailed"].includes(s.stage) && s.stage !== target) {
    await q("update deals set stage=$1, furthest_idx=greatest(furthest_idx,$2), updated_at=now(), stage_changed_at=now() where id=$3", [target, idx(target), s.deal_id]);
  }
  return json({ ok: true });
}
