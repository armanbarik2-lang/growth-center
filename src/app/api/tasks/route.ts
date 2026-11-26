import { q } from "@/lib/db";
import { requireCtx, isResp, json, err, newId } from "@/lib/api";

export async function GET(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const u = new URL(req.url).searchParams;
  const where = ["t.ds=$1"]; const p: unknown[] = [ctx.ds.id];
  if (u.get("owner")) { p.push(u.get("owner")); where.push(`t.owner_id=$${p.length}`); }
  if (u.get("status")) { p.push(u.get("status")); where.push(`t.status=$${p.length}`); }
  if (u.get("campaign")) { p.push(u.get("campaign")); where.push(`t.campaign_id=$${p.length}`); }
  const rows = await q(`select t.*, t.due_date::text due, m.name owner_name, cp.name campaign_name, d.name deal_name, cb.name created_by_name
    from tasks t left join members m on m.id=t.owner_id left join campaigns cp on cp.id=t.campaign_id
    left join deals d on d.id=t.deal_id left join members cb on cb.id=t.created_by
    where ${where.join(" and ")} order by (t.status='done'), t.due_date nulls last, t.created_at desc limit 500`, p);
  return json(rows);
}

export async function POST(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const b = await req.json();
  if (!b.title) return err("Title is required");
  const owner = b.owner_id || ctx.me.id;
  if (ctx.me.role !== "head" && owner !== ctx.me.id) return err("Members can only create tasks for themselves", 403);
  const id = newId(ctx.ds.id, "T");
  await q(`insert into tasks (id, ds, title, details, owner_id, campaign_id, deal_id, company_id, due_date, status, priority, source, created_by)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'todo',$10,$11,$12)`,
    [id, ctx.ds.id, b.title, b.details || null, owner, b.campaign_id || null, b.deal_id || null, b.company_id || null,
     b.due_date || null, b.priority || "normal", b.source === "ai" ? "ai" : "manual", ctx.me.id]);
  if (b.source === "ai") await q("insert into chat_actions (ds, member_id, action, payload) values ($1,$2,'task_created',$3)", [ctx.ds.id, ctx.me.id, JSON.stringify({ id, ...b })]);
  return json({ id });
}
