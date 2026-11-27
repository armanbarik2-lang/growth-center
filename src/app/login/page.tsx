"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/fmt";
import { Button, Badge, cx } from "@/components/ui";
import { demoEmail } from "@/lib/demo-email";

type Person = { id: string; ds: string; name: string; role: string; sector_group: string | null; title: string | null };
type M = { setup: boolean; dbError?: string | null; datasets?: { id: string; name: string; simulated: boolean; description: string }[]; members?: Person[] };
type Sent = { to: string; demo_code?: string; team?: boolean };

const initials = (n: string) => n.replace(/\(.*?\)/g, "").trim().split(" ").map((x) => x[0]).slice(0, 2).join("");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Login() {
  const [m, setM] = useState<M | null>(null);
  const [ds, setDs] = useState("gef");
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code" | "choose">("email");
  const [sent, setSent] = useState<Sent | null>(null);
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const run = useRef(0);
  const router = useRouter();

  const load = () => api<M>("/api/meta").then(setM).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const setup = async () => {
    setBusy(true); setError("");
    try { await api("/api/setup", { method: "POST", body: "{}" }); await load(); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  const verify = async (code: string, id: number) => {
    if (id !== run.current) return;
    setBusy(true); setError(""); setStatus("Verifying the code…");
    try {
      const r = await api<{ ok: boolean; choose?: boolean }>("/api/auth/verify", { method: "POST", body: JSON.stringify({ code }) });
      if (r.choose) { setStep("choose"); setStatus(""); setBusy(false); return; }
      setStatus("Signed in. Opening your workspace…");
      sessionStorage.removeItem("gc-view");
      router.replace("/");
    } catch (e) {
      setError((e as Error).message); setStatus(""); setBusy(false);
      setDigits(Array(6).fill("")); boxes.current[0]?.focus();
    }
  };

  const sendCode = async (to: string) => {
    const id = ++run.current;
    setError(""); setStatus(""); setBusy(true);
    try {
      const r = await api<Sent>("/api/auth/request", { method: "POST", body: JSON.stringify({ email: to }) });
      if (id !== run.current) return;
      setSent(r); setStep("code"); setDigits(Array(6).fill("")); setBusy(false);
      if (r.demo_code) {
        // demo mode: the code "arrives" and types itself in, then signs in
        setStatus("Code received. Filling it in…");
        await sleep(700);
        const d = r.demo_code.split("");
        for (let i = 0; i < 6; i++) {
          if (id !== run.current) return;
          setDigits((p) => p.map((x, j) => (j === i ? d[i] : x)));
          await sleep(140);
        }
        await sleep(250);
        await verify(r.demo_code, id);
      } else {
        setTimeout(() => boxes.current[0]?.focus(), 50);
      }
    } catch (e) {
      if (id === run.current) { setError((e as Error).message); setBusy(false); }
    }
  };

  const pick = (p: Person) => { const e = demoEmail(p.name, p.ds); setEmail(e); setDs(p.ds); sendCode(e); };
  // an email outside the team: after the code, choose which account to view as
  const viewAs = async (p: Person) => {
    setBusy(true); setError(""); setStatus(`Opening ${p.name.replace(/\s*\(.*?\)/, "")}'s view…`);
    try { await api("/api/auth/guest", { method: "POST", body: JSON.stringify({ ds: p.ds, memberId: p.id }) }); sessionStorage.removeItem("gc-view"); router.replace("/"); }
    catch (e) { setError((e as Error).message); setStatus(""); setBusy(false); }
  };
  const quick = (dsId: string, role: string, name?: string) => (m?.members || []).find((x) => x.ds === dsId && x.role === role && (!name || x.name === name));
  const back = () => { run.current++; setStep("email"); setSent(null); setStatus(""); setError(""); setBusy(false); setDigits(Array(6).fill("")); };

  const typeDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) { paste(clean); return; }
    const next = digits.map((x, j) => (j === i ? clean : x));
    setDigits(next);
    if (clean && i < 5) boxes.current[i + 1]?.focus();
    if (next.every((x) => x)) verify(next.join(""), run.current);
  };
  const paste = (text: string) => {
    const d = text.replace(/\D/g, "").slice(0, 6).split("");
    if (!d.length) return;
    const next = Array(6).fill("").map((_, j) => d[j] || "");
    setDigits(next);
    boxes.current[Math.min(d.length, 5)]?.focus();
    if (d.length === 6) verify(d.join(""), run.current);
  };

  const people = (m?.members || []).filter((x) => x.ds === ds);
  const heads = people.filter((x) => x.role === "head"), mems = people.filter((x) => x.role === "member");
  const dsInfo = m?.datasets?.find((d) => d.id === ds);

  const Row = ({ p, compact, onPick }: { p: Person; compact?: boolean; onPick?: (p: Person) => void }) => (
    <button disabled={busy} onClick={() => (onPick || pick)(p)} title={p.role === "head" ? undefined : p.sector_group || undefined}
      className="flex w-full items-center gap-2.5 rounded-lg border border-slate-200 px-2.5 py-2 text-left transition hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-indigo-950">
      <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
        p.role === "head" ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200")}>{initials(p.name)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5"><span className="truncate text-sm font-medium">{p.name.replace(/\s*\(.*?\)/, "")}</span>{p.role === "head" && <Badge tone="indigo">head</Badge>}</span>
        <span className="block truncate font-mono text-[11px] text-slate-500">{demoEmail(p.name, p.ds)}</span>
      </span>
      {!compact && <span className="hidden truncate text-[11px] text-slate-400 sm:block sm:max-w-[11rem]">{p.role === "head" ? (p.title?.replace(/^Head \d: /, "Leads ") || "Full view") : p.sector_group || "Member"}</span>}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-10 px-4 py-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:px-8">
        <section className="relative hidden overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-900 p-9 text-white shadow-2xl shadow-indigo-950/30 lg:block">
          {/* quiet grid and glow, decoration only */}
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)", backgroundSize: "36px 36px", maskImage: "radial-gradient(ellipse at 30% 20%, black 30%, transparent 75%)" }} />
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet-500/30 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-sm font-bold ring-1 ring-white/25 backdrop-blur">GC</span>
              <div><div className="text-sm font-semibold">Growth Center</div><div className="text-[11px] text-indigo-200">Sponsorship command center</div></div>
            </div>

            <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-indigo-100 ring-1 ring-white/20">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />Global Entrepreneurship Fest · Mumbai · 30-31 Jan 2027
            </div>
            <h1 className="mt-4 text-[34px] font-semibold leading-[1.15]">GEF Mumbai 2027<span className="block text-indigo-200">sponsorship cash before the fest, run from one place.</span></h1>

            <div className="mt-7 grid grid-cols-3 gap-3">
              {[
                { v: "₹12.1L-21.5L", l: "Cash before the fest (plan)" },
                { v: "₹26L-40L", l: "Signed sponsorship (plan)" },
                { v: "5 + 1", l: "Ranked bets + mass email" },
              ].map((x) => (
                <div key={x.l} className="rounded-2xl bg-white/[0.07] p-3.5 ring-1 ring-white/15 backdrop-blur-sm">
                  <div className="num text-lg font-semibold text-cyan-200">{x.v}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-indigo-200">{x.l}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-[1.15fr_1fr] gap-3">
              <div className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/15">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200">Plan funnel (GES playbook)</div>
                <div className="mt-3 space-y-2">
                  {[{ l: "Called", n: "1,000", w: 100 }, { l: "Good leads", n: "100", w: 62 }, { l: "Meetings", n: "50", w: 42 }, { l: "Deals", n: "10", w: 24 }].map((f) => (
                    <div key={f.l} className="flex items-center gap-2 text-[11px]">
                      <span className="w-16 shrink-0 text-indigo-100">{f.l}</span>
                      <span className="h-2 rounded-full bg-gradient-to-r from-cyan-300 to-indigo-300" style={{ width: `${f.w}%` }} />
                      <span className="num ml-auto text-white">{f.n}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl bg-white/[0.07] p-4 ring-1 ring-white/15">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200">Every bet has a line</div>
                <div className="mt-3 flex flex-col gap-1.5">
                  {[{ t: "Scale", c: "bg-emerald-400/20 text-emerald-200 ring-emerald-300/30" }, { t: "Change", c: "bg-amber-400/20 text-amber-100 ring-amber-300/30" }, { t: "Stop", c: "bg-rose-400/20 text-rose-100 ring-rose-300/30" }].map((x) => (
                    <span key={x.t} className={cx("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1", x.c)}><span className="h-1.5 w-1.5 rounded-full bg-current" />{x.t}</span>
                  ))}
                </div>
                <div className="mt-2.5 text-[11px] leading-snug text-indigo-200">Read every Monday against a pre-agreed test.</div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-white p-4 text-slate-800 shadow-xl shadow-indigo-950/40">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-indigo-600"><span>✦</span>AI copilot · simulated week 5</div>
              <p className="mt-1.5 text-[13px] leading-relaxed">Conglomerates is at <span className="rounded bg-amber-100 px-1 font-medium text-amber-800">Change</span>: 1 meeting per 30 units against a line of 3+. The agreed move is to reach units through speaker invites. Create 3 tasks for Ishita?</p>
              <div className="mt-2.5 flex gap-2"><span className="rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white">Confirm</span><span className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600">Dismiss</span><span className="ml-auto self-center text-[10px] text-slate-400">nothing changes until you confirm</span></div>
            </div>

            <p className="mt-6 text-[11px] leading-relaxed text-indigo-200/80">Two workspaces: GEF Mumbai 2027, simulated from our plan with fictional companies and people, and CampusFest 2025, the original dataset from the brief.</p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-xl">
          <div className="mb-5 text-center lg:hidden"><div className="text-xs font-semibold uppercase tracking-wider text-indigo-600">GEF Mumbai 2027</div><h1 className="text-2xl font-semibold">Growth Center</h1><p className="text-sm text-slate-500">Sponsorship command center</p></div>
          {!m && <p className="text-center text-sm text-slate-500">Loading…</p>}
          {m && !m.setup && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-semibold">First-time setup</h2>
              <p className="mt-1 text-sm text-slate-500">{m.dbError ? m.dbError : "The database is empty. This creates the tables and loads both datasets (original CampusFest 2025 and simulated GEF Mumbai)."}</p>
              <Button kind="primary" className="mt-3" onClick={setup} disabled={busy || !!m.dbError}>{busy ? "Setting up…" : "Create tables and load data"}</Button>
              {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
            </div>
          )}
          {m?.setup && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              {step === "email" ? (
                <>
                  <h2 className="text-lg font-semibold">Sign in</h2>
                  <p className="mt-0.5 text-sm text-slate-500">Enter your email and we will send you a one-time code. Any email works; team accounts are listed below.</p>
                  <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (email.trim()) sendCode(email.trim()); }}>
                    <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950" />
                    <Button kind="primary" type="submit" disabled={busy || !email.trim()}>{busy ? "Sending…" : "Send code"}</Button>
                  </form>
                  {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

                  <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <div><div className="text-sm font-medium">Team accounts</div><div className="text-[11px] text-slate-500">Click one to sign in as that person. The code is filled in for you.</div></div>
                      <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs dark:border-slate-700">
                        {(m.datasets || []).map((d) => (
                          <button key={d.id} onClick={() => setDs(d.id)} className={cx("whitespace-nowrap rounded-md px-2.5 py-1 transition", ds === d.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800")}>
                            {d.simulated ? "GEF Mumbai 2027" : "CampusFest 2025"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {dsInfo && <p className="mt-2 text-[11px] text-slate-500">{dsInfo.simulated ? "Simulated from our plan." : "Original dataset from the brief."} Heads see the whole team, cash and every strategy; members see their own work.</p>}
                    <div className="mt-3 space-y-1.5">{heads.map((p) => <Row key={p.id} p={p} />)}</div>
                    {mems.length > 0 && <div className="scroll-thin mt-3 grid max-h-64 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">{mems.map((p) => <Row key={p.id} p={p} compact />)}</div>}
                  </div>
                </>
              ) : step === "choose" ? (
                <>
                  <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs dark:bg-emerald-900/60">✓</span>Verified {email}</div>
                  <h2 className="mt-3 text-lg font-semibold">Choose how to explore</h2>
                  <p className="mt-0.5 text-sm text-slate-500">Your email is not on a team yet, so pick a view. You can switch any time from the sidebar.</p>
                  <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                    {[
                      { p: quick("gef", "head", "Ishita Rao") || quick("gef", "head"), t: "GEF Mumbai 2027 · Head", d: "Team targets, cash before the fest, every strategy, AI copilot" },
                      { p: quick("gef", "member", "Aarav Shah") || quick("gef", "member"), t: "GEF Mumbai 2027 · Member", d: "Personal goals, own companies, sequences and notes" },
                      { p: quick("campusfest", "head"), t: "CampusFest 2025 · Head", d: "The original dataset: channels, targets, snapshots" },
                      { p: quick("campusfest", "member", "Riya Kapoor") || quick("campusfest", "member"), t: "CampusFest 2025 · Member", d: "One member's results in the original data" },
                    ].filter((o) => o.p).map((o) => (
                      <button key={o.t} disabled={busy} onClick={() => viewAs(o.p!)}
                        className="rounded-xl border border-slate-200 p-3 text-left transition hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-indigo-950">
                        <div className="text-sm font-semibold">{o.t}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">as {o.p!.name.replace(/\s*\(.*?\)/, "")}</div>
                        <div className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">{o.d}</div>
                      </button>
                    ))}
                  </div>
                  <details className="mt-4 text-sm">
                    <summary className="cursor-pointer text-xs font-medium text-indigo-600 dark:text-indigo-400">Or view as any team member</summary>
                    <div className="mt-2 flex rounded-lg border border-slate-200 p-0.5 text-xs dark:border-slate-700">
                      {(m.datasets || []).map((d) => (
                        <button key={d.id} onClick={() => setDs(d.id)} className={cx("flex-1 rounded-md px-2.5 py-1 transition", ds === d.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800")}>
                          {d.simulated ? "GEF Mumbai 2027" : "CampusFest 2025"}
                        </button>
                      ))}
                    </div>
                    <div className="scroll-thin mt-2 grid max-h-64 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">{people.map((p) => <Row key={p.id} p={p} compact onPick={viewAs} />)}</div>
                  </details>
                  <div className="mt-3 min-h-[1.25rem] text-sm">{error ? <span className="text-rose-600">{error}</span> : <span className="text-slate-500">{status}</span>}</div>
                  <button onClick={back} className="text-xs text-slate-500 hover:underline">Use a different email</button>
                </>
              ) : (
                <>
                  <button onClick={back} className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">← Use a different email</button>
                  <h2 className="mt-2 text-lg font-semibold">Check your email</h2>
                  <p className="mt-0.5 text-sm text-slate-500">We sent a 6-digit code to <span className="font-medium text-slate-700 dark:text-slate-200">{sent?.to}</span>. It expires in 5 minutes.</p>
                  {sent?.demo_code && (
                    <div className="mt-4 flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-900 dark:bg-indigo-950/60">
                      <span className="text-lg">✉</span>
                      <div className="text-xs text-indigo-900 dark:text-indigo-100">
                        <div className="font-semibold">Demo inbox</div>
                        <div>Your Growth Center sign-in code is <span className="font-mono text-sm font-semibold tracking-widest">{sent.demo_code}</span></div>
                      </div>
                    </div>
                  )}
                  <div className="mt-5 flex justify-between gap-2" onPaste={(e) => { e.preventDefault(); paste(e.clipboardData.getData("text")); }}>
                    {digits.map((d, i) => (
                      <input key={i} ref={(el) => { boxes.current[i] = el; }} value={d} inputMode="numeric" maxLength={6} aria-label={`Digit ${i + 1}`}
                        onChange={(e) => typeDigit(i, e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) boxes.current[i - 1]?.focus(); }}
                        className={cx("h-14 w-12 rounded-xl border text-center font-mono text-2xl font-semibold outline-none transition focus:border-indigo-500 sm:w-14 dark:bg-slate-950",
                          d ? "border-indigo-400 bg-indigo-50/60 dark:border-indigo-700" : "border-slate-200 dark:border-slate-700")} />
                    ))}
                  </div>
                  <div className="mt-4 min-h-[1.25rem] text-sm">
                    {error ? <span className="text-rose-600">{error}</span> : <span className="text-slate-500">{status}</span>}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>Signing in as {email}</span>
                    <button onClick={() => sendCode(email)} disabled={busy} className="text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400">Resend code</button>
                  </div>
                </>
              )}
            </div>
          )}
          <p className="mt-4 text-center text-[11px] text-slate-400">Demo workspace: email delivery is simulated, so the code is shown on screen and no email is sent.</p>
        </section>
      </div>
    </div>
  );
}
