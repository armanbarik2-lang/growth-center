import { q } from "@/lib/db";
import { requireCtx, isResp, json } from "@/lib/api";
/** Company search for pickers. */
export async function GET(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const s = new URL(req.url).searchParams.get("q") || "";
  const rows = await q(`select c.id, c.name, c.sector_group, m.name owner_name from companies c left join members m on m.id=c.owner_id
    where c.ds=$1 and c.name ilike $2 order by c.name limit 20`, [ctx.ds.id, `%${s}%`]);
  return json(rows);
}
