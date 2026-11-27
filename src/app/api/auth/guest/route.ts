import { cookies } from "next/headers";
import { one } from "@/lib/db";
import { readToken, writeSession } from "@/lib/session";
import { json, err } from "@/lib/api";

/** Step 3 for an email outside the team: after a verified code, choose which demo account to view as. */
export async function POST(req: Request) {
  const jar = await cookies();
  const pass = readToken<{ email: string }>(jar.get("gc_guest")?.value);
  if (!pass) return err("Your sign-in has expired. Send a new code.", 401);
  const b = await req.json().catch(() => ({}));
  const m = await one("select id from members where id=$1 and ds=$2", [b.memberId, b.ds]);
  if (!m) return err("Unknown account for this workspace");
  jar.delete("gc_guest");
  await writeSession({ ds: String(b.ds), memberId: String(b.memberId), viewer: pass.email });
  return json({ ok: true });
}
