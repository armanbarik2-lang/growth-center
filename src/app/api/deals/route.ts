import { q } from "@/lib/db";
import { requireCtx, isResp, json, err, newId } from "@/lib/api";
import { stageIdx } from "@/lib/metrics";

export async function GET(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const u = new URL(req.url).searchParams;
  const where = ["d.ds=$1"]; const p: unknown[] = [ctx.ds.id];
  const add = (sql: string, v: unknown) => { p.push(v); where.push(sql.replace("?", `$${p.length}`)); };
  if (u.get("campaign")) add("d.campaign_id=?", u.get("campaign"));
  if (u.get("owner")) add("d.owner_id=?", u.get("owner"));
  if (u.get("sector")) add("c.sector_group=?", u.get("sector"));
  if (u.get("stage")) add("d.stage=?", u.get("stage"));
  if (u.get("q")) { p.push(`%${u.get("q")}%`); where.push(`(d.name ilike $${p.length} or c.name ilike $${p.length})`); }
  const limit = Math.min(Number(u.get("limit") || 400), 2000);
  const rows = await q(`
    select d.id, d.name, d.stage, d.proposed_value, d.confirmed_value, d.support_type, d.package, d.owner_id, m.name owner_name,
      d.campaign_id, cp.name campaign_name, d.company_id, c.name company_name, c.sector_group, d.updated_at, d.stage_changed_at,
      ct.name contact_name, ct.title contact_title,
      (select count(*)::int from notes n where n.company_id=d.company_id and (n.kind='remark' or n.to_members or $${p.length + 1}::boolean or n.author_id=$${p.length + 2})) note_count,
      (select max(a.occurred_at) from activities a where a.company_id=d.company_id and a.ds=d.ds) last_activity
    from deals d left join companies c on c.id=d.company_id left join members m on m.id=d.owner_id
      left join campaigns cp on cp.id=d.campaign_id left join contacts ct on ct.id=d.contact_id
    where ${where.join(" and ")} order by d.furthest_idx desc, d.updated_at desc limit ${limit}`, [...p, ctx.me.role === "head", ctx.me.id]);
  const counts = await q(`select d.stage, count(*)::int n from deals d left join companies c on c.id=d.company_id
    where ${where.join(" and ")} group by d.stage`, p);
  // members see values only on their own deals
  if (ctx.me.role !== "head") for (const r of rows as Record<string, unknown>[]) if (r.owner_id !== ctx.me.id) { r.proposed_value = null; r.confirmed_value = null; }
  const sectors = await q("select distinct sector_group from companies where ds=$1 and sector_group is not null order by 1", [ctx.ds.id]);
  return json({ rows, counts, sectors: sectors.map((s) => (s as { sector_group: string }).sector_group) });
}

/** New company + contact + deal (simple add form). */
export async function POST(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const b = await req.json();
  if (!b.company_name) return err("Company name is required");
  const owner = ctx.me.role === "head" ? b.owner_id || ctx.me.id : ctx.me.id;
  const first = ctx.ds.stages[0].key;
  const cid = newId(ctx.ds.id, "C"), did = newId(ctx.ds.id, "D");
  await q(`insert into companies (id, ds, name, industry, sector_group, owner_id, campaign_id, qualification, created_at)
    values ($1,$2,$3,$4,$5,$6,$7,'qualified',now())`, [cid, ctx.ds.id, b.company_name, b.industry || null, b.sector_group || null, owner, b.campaign_id || null]);
  let contact: string | null = null;
  if (b.contact_name) {
    contact = newId(ctx.ds.id, "P");
    await q("insert into contacts (id, ds, company_id, name, title, email) values ($1,$2,$3,$4,$5,$6)", [contact, ctx.ds.id, cid, b.contact_name, b.contact_title || null, b.contact_email || null]);
  }
  await q(`insert into deals (id, ds, name, company_id, contact_id, campaign_id, owner_id, support_type, stage, furthest_idx, proposed_value, package)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11)`,
    [did, ctx.ds.id, `${b.company_name} partnership`, cid, contact, b.campaign_id || null, owner, b.support_type || "cash", first, Number(b.proposed_value) || 0, b.package || null]);
  await q("insert into deal_history (id, ds, deal_id, stage, proposed_value, confirmed_value, owner_id, changed_by) values ($1,$2,$3,$4,$5,0,$6,$7)",
    [newId(ctx.ds.id, "H"), ctx.ds.id, did, first, Number(b.proposed_value) || 0, owner, ctx.me.id]);
  void stageIdx;
  return json({ id: did, company_id: cid });
}
