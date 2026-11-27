import { cookies } from "next/headers";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { one } from "./db";

export type Stage = { key: string; label: string; kind: "open" | "won" | "post" | "exit"; funnel_label?: string };
export type Dataset = {
  id: string; name: string; description: string; simulated: boolean; as_of: string | null;
  outreach_start: string; fest_start: string; fest_end: string; stages: Stage[]; won_stage: string;
  stage_prob: Record<string, number | null>; prob_source: string;
};
export type Member = { id: string; ds: string; name: string; role: "head" | "member"; sector_group: string | null; title: string | null };
export type Ctx = { ds: Dataset; me: Member; today: Date; week: number };

const COOKIE = "gc_session";

/**
 * The session cookie is signed (HMAC-SHA256), so a member cannot edit it to become a head.
 * Key: SESSION_SECRET; if that is not set, a key derived from DATABASE_URL (also server-only).
 */
function signingKey(): Buffer {
  const secret = process.env.SESSION_SECRET || `gc-session:${process.env.DATABASE_URL ?? ""}`;
  return createHash("sha256").update(secret).digest();
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/** A short-lived signed value (used for the one-time sign-in code). Returns null if edited or expired. */
export function signToken(data: Record<string, unknown>, ttlSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + ttlSeconds * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function readToken<T = Record<string, unknown>>(token: string | undefined): (T & { exp: number }) | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot), given = Buffer.from(token.slice(dot + 1)), expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const v = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof v?.exp === "number" && v.exp > Date.now() ? v : null;
  } catch { return null; }
}
export function codeHash(code: string): string {
  return createHmac("sha256", signingKey()).update(`otp:${code}`).digest("base64url");
}

export async function readSession(): Promise<{ ds: string; memberId: string } | null> {
  const c = (await cookies()).get(COOKIE)?.value;
  if (!c) return null;
  const dot = c.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = c.slice(0, dot);
  const given = Buffer.from(c.slice(dot + 1));
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof s?.ds === "string" && typeof s?.memberId === "string" ? { ds: s.ds, memberId: s.memberId } : null;
  } catch { return null; }
}

export async function writeSession(s: { ds: string; memberId: string } | null) {
  const jar = await cookies();
  if (!s) { jar.delete(COOKIE); return; }
  const payload = Buffer.from(JSON.stringify({ ds: s.ds, memberId: s.memberId })).toString("base64url");
  jar.set(COOKIE, `${payload}.${sign(payload)}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export function todayOf(ds: Dataset): Date {
  return ds.as_of ? new Date(ds.as_of) : new Date();
}

export function weekOf(ds: Dataset, d: Date): number {
  const start = new Date(ds.outreach_start + "T00:00:00+05:30");
  return Math.floor((d.getTime() - start.getTime()) / (7 * 86400000)) + 1;
}

export async function getDataset(id: string): Promise<Dataset | null> {
  const d = await one<Dataset>(
    `select id,name,description,simulated,as_of,to_char(outreach_start,'YYYY-MM-DD') outreach_start,
     to_char(fest_start,'YYYY-MM-DD') fest_start,to_char(fest_end,'YYYY-MM-DD') fest_end,stages,won_stage,stage_prob,prob_source
     from datasets where id=$1`, [id]);
  return d;
}

/** Returns the signed-in context or null. */
export async function getCtx(): Promise<Ctx | null> {
  const s = await readSession();
  if (!s) return null;
  const ds = await getDataset(s.ds);
  if (!ds) return null;
  const me = await one<Member>("select * from members where id=$1 and ds=$2", [s.memberId, s.ds]);
  if (!me) return null;
  const today = todayOf(ds);
  return { ds, me, today, week: weekOf(ds, today) };
}

export function canEdit(ctx: Ctx, ownerId: string | null | undefined) {
  return ctx.me.role === "head" || (!!ownerId && ownerId === ctx.me.id);
}
