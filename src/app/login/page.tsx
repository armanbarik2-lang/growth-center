"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/fmt";
import { Button, Badge, cx } from "@/components/ui";
import { demoEmail } from "@/lib/demo-email";

type Person = { id: string; ds: string; name: string; role: string; sector_group: string | null; title: string | null };
type M = { setup: boolean; dbError?: string | null; datasets?: { id: string; name: string; simulated: boolean; description: string }[]; members?: Person[] };
type Sent = { to: string; demo_code?: string };

const initials = (n: string) => n.replace(/\(.*?\)/g, "").trim().split(" ").map((x) => x[0]).slice(0, 2).join("");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Login() {
  const [m, setM] = useState<M | null>(null);
  const [ds, setDs] = useState("gef");
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
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
      await api("/api/auth/verify", { method: "POST", body: JSON.stringify({ code }) });
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

  const Row = ({ p, compact }: { p: Person; compact?: boolean }) => (
    <button disabled={busy} onClick={() => pick(p)} title={p.role === "head" ? undefined : p.sector_group || undefined}
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
      <div className="mx-auto grid min-h-screen max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <section className="hidden lg:block">
          <div className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Growth Center</div>
          <h1 className="mt-3 text-4xl font-semibold leading-tight text-slate-900 dark:text-white">Sponsorship cash before the fest, run from one place.</h1>
          <ul className="mt-6 space-y-3 text-sm text-slate-600 dark:text-slate-300">
            {["Funnel, targets and pace, updated live",
              "Every strategy with its early test and scale, change or stop line",
              "Pipeline, email sequences, tasks, payments and meeting notes",
              "An AI copilot that answers from your data and acts only after you confirm"].map((t) => (
              <li key={t} className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />{t}</li>
            ))}
          </ul>
          <p className="mt-8 text-xs text-slate-400">Two workspaces: GEF Mumbai 2027 (simulated from our plan, fictional companies and people) and CampusFest 2025 (the original dataset from the brief, unchanged except for removing exact duplicate rows).</p>
        </section>

        <section className="mx-auto w-full max-w-xl">
          <div className="mb-4 text-center lg:hidden"><h1 className="text-2xl font-semibold">Growth Center</h1><p className="text-sm text-slate-500">Sponsorship command center</p></div>
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
                  <p className="mt-0.5 text-sm text-slate-500">Enter your work email and we will send you a one-time code.</p>
                  <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (email.trim()) sendCode(email.trim()); }}>
                    <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gef.demo"
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950" />
                    <Button kind="primary" type="submit" disabled={busy || !email.trim()}>{busy ? "Sending…" : "Send code"}</Button>
                  </form>
                  {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

                  <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <div><div className="text-sm font-medium">Demo accounts</div><div className="text-[11px] text-slate-500">Click one to sign in. The code is filled in for you.</div></div>
                      <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs dark:border-slate-700">
                        {(m.datasets || []).map((d) => (
                          <button key={d.id} onClick={() => setDs(d.id)} className={cx("rounded-md px-2.5 py-1 transition", ds === d.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800")}>
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
          <p className="mt-4 text-center text-[11px] text-slate-400">Demo workspace: email delivery is simulated, so the code is shown on screen. No real inboxes are used.</p>
        </section>
      </div>
    </div>
  );
}
