import { writeSession } from "@/lib/session";
import { json, err } from "@/lib/api";

/** Sign-in happens only through the email code (/api/auth/request, /api/auth/verify). */
export async function POST() {
  return err("Sign in with your email and the one-time code.", 405);
}
export async function DELETE() {
  await writeSession(null);
  return json({ ok: true });
}
