import { cookies } from "next/headers";
import { readToken, signToken, codeHash, writeSession } from "@/lib/session";
import { json, err } from "@/lib/api";

const OTP_COOKIE = "gc_otp";
type Otp = { email: string; ds: string; memberId: string; h: string; tries: number };

/** Step 2 of sign-in: check the code against the signed challenge; 5 wrong tries end it. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const code = String(b.code || "").replace(/\D/g, "");
  const jar = await cookies();
  const otp = readToken<Otp>(jar.get(OTP_COOKIE)?.value);
  if (!otp) return err("This code has expired or was never sent. Send a new code.", 401);
  if (code.length !== 6 || codeHash(code) !== otp.h) {
    const tries = (otp.tries || 0) + 1;
    if (tries >= 5) { jar.delete(OTP_COOKIE); return err("Too many wrong codes. Request a new one.", 401); }
    const left = Math.max(1, Math.round((otp.exp - Date.now()) / 1000));
    jar.set(OTP_COOKIE, signToken({ email: otp.email, ds: otp.ds, memberId: otp.memberId, h: otp.h, tries }, left),
      { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: left });
    return err(`That code is not right. ${5 - tries} tries left.`, 401);
  }
  jar.delete(OTP_COOKIE);
  await writeSession({ ds: otp.ds, memberId: otp.memberId });
  return json({ ok: true, ds: otp.ds });
}
