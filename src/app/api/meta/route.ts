import { q } from "@/lib/db";
import { isSetUp } from "@/lib/seed";
import { getCtx } from "@/lib/session";
import { json } from "@/lib/api";

export async function GET() {
  let setup = false;
  try { setup = await isSetUp(); } catch { setup = false; }
  if (!setup) return json({ setup: false, dbError: !process.env.DATABASE_URL ? "DATABASE_URL is not set" : null });
  const datasets = await q("select id, name, simulated, description from datasets order by simulated desc");
  const members = await q("select id, ds, name, role, sector_group, title from members order by ds, role, name");
  const ctx = await getCtx().catch(() => null);
  return json({
    setup: true, datasets, members, ai: !!process.env.GEMINI_API_KEY,
    ctx: ctx ? { ds: ctx.ds, me: ctx.me, today: ctx.today.toISOString(), week: ctx.week, viewer: ctx.viewer || null } : null,
  });
}
