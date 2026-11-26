import { myWork } from "@/lib/mywork";
import { requireCtx, isResp, json } from "@/lib/api";
export async function GET() {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  return json(await myWork(ctx.ds, ctx.me.id));
}
