import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { q } from "@/lib/db";
import { signToken, codeHash } from "@/lib/session";
import { demoEmail, maskEmail } from "@/lib/demo-email";
import { json, err } from "@/lib/api";

const OTP_COOKIE = "gc_otp";

/** Step 1 of sign-in: find the account for this email and issue a 6-digit code (valid 5 minutes). */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("Enter a valid email address");
  const members = await q<{ id: string; ds: string; name: string }>("select id, ds, name from members");
  const m = members.find((x) => demoEmail(x.name, x.ds) === email);
  // an email outside the team is welcome too: after the code, they choose which demo account to view as
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  (await cookies()).set(OTP_COOKIE, signToken({ email, ds: m?.ds || "", memberId: m?.id || "", guest: !m, h: codeHash(code), tries: 0 }, 300),
    { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300 });
  // demo mode (default): email delivery is simulated, so the code is returned to the screen; set DEMO_OTP=off to hide it
  const demo = process.env.DEMO_OTP !== "off";
  return json({ sent: true, to: maskEmail(email), expires_in: 300, team: !!m, ...(demo ? { demo_code: code } : {}) });
}
