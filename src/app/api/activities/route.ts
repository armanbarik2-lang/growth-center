import { q, one } from "@/lib/db";
import { canEdit } from "@/lib/session";
import { requireCtx, isResp, json, err, newId } from "@/lib/api";
import { stopForCompany, autoStart } from "@/lib/outreach";

/** Log a call / email / meeting / note against a company. Optional: switch to a new contact. */
export async function POST(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const b = await req.json();
  const c = await one<{ id: string; owner_id: string; campaign_id: string | null }>("select id, owner_id, campaign_id from companies where id=$1 and ds=$2", [b.company_id, ctx.ds.id]);
  if (!c) return err("Company not found", 404);
  if (!canEdit(ctx, c.owner_id)) return err("Members can only log activity on their own companies", 403);
  let contactId = b.contact_id || null;
  if (b.new_contact_name) {
    await q("update contacts set active=false where company_id=$1", [c.id]);
    contactId = newId(ctx.ds.id, "P");
    await q("insert into contacts (id, ds, company_id, name, title, email, active) values ($1,$2,$3,$4,$5,$6,true)",
      [contactId, ctx.ds.id, c.id, b.new_contact_name, b.new_contact_title || null, b.new_contact_email || null]);
    await q("update deals set contact_id=$1 where company_id=$2", [contactId, c.id]);
    // a not-connected company with a fresh contact goes back to the call list
    await q("update deals set stage='prospect', updated_at=now(), stage_changed_at=now() where company_id=$1 and stage='call_attempted'", [c.id]);
  }
  const id = newId(ctx.ds.id, "A");
  await q(`insert into activities (id, ds, company_id, contact_id, campaign_id, owner_id, channel, type, outcome, summary, occurred_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,coalesce($11::timestamptz, now()))`,
    [id, ctx.ds.id, c.id, contactId, b.campaign_id || c.campaign_id, ctx.me.id, b.channel || null, b.type || "note", b.outcome || null, b.summary || null, b.occurred_at || null]);
  // a logged reply or contact switch stops the company's email sequence; a mailed proposal starts one
  if (["reply", "replied"].includes(b.type)) await stopForCompany(ctx, c.id, "Reply received", "replied", b.outcome || null);
  if (b.new_contact_name || b.type === "contact_switched") await stopForCompany(ctx, c.id, "Contact switched", "stopped");
  if (b.type === "proposal_mailed") {
    const d = await one<{ id: string }>("select id from deals where company_id=$1 and ds=$2 limit 1", [c.id, ctx.ds.id]);
    if (d) await autoStart(ctx, d.id);
  }
  // calls move early-stage deals automatically (simulated plan stages)
  if (b.type === "call" && ctx.ds.stages.some((s) => s.key === "call_attempted")) {
    const idx = (k: string) => ctx.ds.stages.findIndex((s) => s.key === k);
    if (b.outcome === "no_answer") {
      await q("update deals set stage='call_attempted', furthest_idx=greatest(furthest_idx,$2), updated_at=now(), stage_changed_at=now() where company_id=$1 and stage='prospect'", [c.id, idx("call_attempted")]);
    } else if (b.outcome === "connected") {
      await q("update deals set stage='called', furthest_idx=greatest(furthest_idx,$2), updated_at=now(), stage_changed_at=now() where company_id=$1 and stage in ('prospect','call_attempted')", [c.id, idx("called")]);
    }
  }
  return json({ id });
}
