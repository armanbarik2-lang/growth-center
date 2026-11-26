import { dashboard } from "@/lib/metrics";
import { requireCtx, isResp, json } from "@/lib/api";

export async function GET(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  if (ctx.me.role !== "head") return json({ error: "The team dashboard is for heads. Members see My work." }, 403);
  const owner = new URL(req.url).searchParams.get("owner");
  return json(await dashboard(ctx.ds, owner || null));
}
