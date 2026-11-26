import { runSetup, isSetUp } from "@/lib/seed";
import { getCtx } from "@/lib/session";
import { json, err } from "@/lib/api";

export const maxDuration = 60;

/** Creates tables and loads both datasets. First run: open. Later runs: a head must be signed in (or SETUP_KEY given). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ready = await isSetUp();
  if (ready) {
    const key = process.env.SETUP_KEY;
    const ctx = await getCtx().catch(() => null);
    const keyOk = key && body.key === key;
    if (!keyOk && ctx?.me.role !== "head") return err("Only a head can reset the demo data", 403);
  }
  try {
    const counts = await runSetup();
    return json({ ok: true, counts });
  } catch (e) {
    return err((e as Error).message, 500);
  }
}
