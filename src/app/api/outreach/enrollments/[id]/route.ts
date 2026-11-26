import { q, one } from "@/lib/db";
import { recordReply, enroll } from "@/lib/outreach";
import { canEdit } from "@/lib/session";
import { requireCtx, isResp, json, err } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const { id } = await params;
  const steps = await q("select id, step_no, day, type, due_date::text due, status, subject, body, outcome, done_at from outreach_steps where enrollment_id=$1 and ds=$2 order by step_no", [id, ctx.ds.id]);
  return json(steps);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const { id } = await params;
  const e = await one<{ owner_id: string; deal_id: string; status: string }>("select owner_id, deal_id, status from enrollments where id=$1 and ds=$2", [id, ctx.ds.id]);
  if (!e) return err("Not found", 404);
  if (!canEdit(ctx, e.owner_id)) return err("Members can only work their own sequences", 403);
  const b = await req.json();
  if (b.action === "reply") {
    if (!["positive", "neutral", "not_interested"].includes(b.outcome)) return err("Pick how they replied");
    return json(await recordReply(ctx, id, b.outcome, b.note));
  }
  if (b.action === "stop") {
    await q("update enrollments set status='stopped', stopped_at=now(), stop_reason=$2 where id=$1", [id, b.reason || "Stopped by user"]);
    await q("update outreach_steps set status='skipped' where enrollment_id=$1 and status='pending'", [id]);
    return json({ ok: true });
  }
  if (b.action === "restart") {
    if (e.status === "active") return err("Already active");
    return json({ id: await enroll(ctx, e.deal_id, b.sequence_id || null) });
  }
  return err("Unknown action");
}
