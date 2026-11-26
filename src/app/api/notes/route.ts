import { q, one } from "@/lib/db";
import { requireCtx, isResp, json, err, newId } from "@/lib/api";

/** Notes visible to me. Detail is shown only to its audience; everyone else sees the brief. */
export async function GET(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const u = new URL(req.url).searchParams;
  const me = ctx.me.id, head = ctx.me.role === "head";
  const p: unknown[] = [ctx.ds.id, me];
  const where = ["n.ds=$1", head ? "true" : "(n.to_members or n.author_id=$2 or n.kind='remark')"];
  if (u.get("company")) { p.push(u.get("company")); where.push(`n.company_id=$${p.length}`); }
  if (u.get("deal")) { p.push(u.get("deal")); where.push(`n.deal_id=$${p.length}`); }
  if (u.get("kind")) { p.push(u.get("kind")); where.push(`n.kind=$${p.length}`); }
  const rows = await q<Record<string, unknown>>(`
    select n.*, a.name author_name, a.role author_role, c.name company_name,
      (n.author_id=$2 or n.kind='remark' or exists (select 1 from note_reads r where r.note_id=n.id and r.member_id=$2)) as read
    from notes n left join members a on a.id=n.author_id left join companies c on c.id=n.company_id
    where ${where.join(" and ")} order by n.created_at desc limit 200`, p);
  const heads = await q<{ id: string; name: string }>("select id, name from members where ds=$1 and role='head'", [ctx.ds.id]);
  const hn = new Map(heads.map((h) => [h.id, h.name]));
  const out = rows.map((n) => {
    const th = (n.to_heads as string[]) || [];
    const fullAccess = n.author_id === me || n.kind === "remark" || (head && (th.includes("*") || th.includes(me)));
    return { ...n, detail: fullAccess ? n.detail : null, detail_hidden: !fullAccess && !!n.detail,
      audience: `${th.includes("*") ? "All heads" : th.map((h) => hn.get(h) || h).join(", ") || "No heads"}${n.to_members ? " + brief to all members" : ""}` };
  });
  return json(out);
}

export async function POST(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const b = await req.json();
  if (!b.title?.trim()) return err("Title is required");
  const kind = ["mom", "remark", "update"].includes(b.kind) ? b.kind : "update";
  let companyId = b.company_id || null, dealId = b.deal_id || null;
  if (dealId) {
    const d = await one<{ company_id: string; owner_id: string }>("select company_id, owner_id from deals where id=$1 and ds=$2", [dealId, ctx.ds.id]);
    if (!d) return err("Deal not found", 404);
    companyId = d.company_id;
    if (kind === "remark" && ctx.me.role !== "head" && d.owner_id !== ctx.me.id) return err("Members can add remarks only on their own deals", 403);
  } else if (companyId) {
    const d = await one<{ id: string }>("select id from deals where company_id=$1 and ds=$2 limit 1", [companyId, ctx.ds.id]);
    dealId = d?.id || null;
  }
  const id = newId(ctx.ds.id, "N");
  const toHeads = Array.isArray(b.to_heads) ? b.to_heads : [];
  await q(`insert into notes (id, ds, kind, company_id, deal_id, author_id, title, detail, brief, meeting_at, to_heads, to_members)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, ctx.ds.id, kind, companyId, dealId, ctx.me.id, b.title.trim(), b.detail || null, b.brief || null,
     kind === "mom" ? b.meeting_at || new Date().toISOString() : null, JSON.stringify(toHeads), !!b.to_members]);
  await q("insert into note_reads (note_id, member_id) values ($1,$2) on conflict do nothing", [id, ctx.me.id]);
  if (kind === "mom" && companyId && b.log_meeting !== false) {
    const c = await one<{ campaign_id: string | null }>("select campaign_id from companies where id=$1", [companyId]);
    await q(`insert into activities (id, ds, company_id, campaign_id, owner_id, channel, type, outcome, summary, occurred_at)
      values ($1,$2,$3,$4,$5,'meeting','meeting_held','attended',$6,coalesce($7::timestamptz, now()))`,
      [newId(ctx.ds.id, "A"), ctx.ds.id, companyId, c?.campaign_id || null, ctx.me.id, `Meeting notes: ${b.title.trim()}`, b.meeting_at || null]);
  }
  return json({ id });
}

export async function DELETE(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const id = new URL(req.url).searchParams.get("id");
  const n = await one<{ author_id: string }>("select author_id from notes where id=$1 and ds=$2", [id, ctx.ds.id]);
  if (!n) return err("Not found", 404);
  if (ctx.me.role !== "head" && n.author_id !== ctx.me.id) return err("Only the author or a head can delete this", 403);
  await q("delete from notes where id=$1", [id]);
  return json({ ok: true });
}
