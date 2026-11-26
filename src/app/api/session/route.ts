import { one } from "@/lib/db";
import { writeSession } from "@/lib/session";
import { json, err } from "@/lib/api";

export async function POST(req: Request) {
  const { ds, memberId } = await req.json();
  const m = await one("select id from members where id=$1 and ds=$2", [memberId, ds]);
  if (!m) return err("Unknown member for this dataset");
  await writeSession({ ds, memberId });
  return json({ ok: true });
}
export async function DELETE() {
  await writeSession(null);
  return json({ ok: true });
}
