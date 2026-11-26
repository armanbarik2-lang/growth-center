"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/fmt";
import { Button, Badge, cx } from "@/components/ui";

type Person = { id: string; ds: string; name: string; role: string; sector_group: string | null; title: string | null };
type M = { setup: boolean; dbError?: string | null; datasets?: { id: string; name: string; simulated: boolean; description: string }[]; members?: Person[] };

const initials = (n: string) => n.split(" ").map((x) => x[0]).slice(0, 2).join("");

export default function Login() {
  const [m, setM] = useState<M | null>(null);
  const [ds, setDs] = useState("gef");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const load = () => api<M>("/api/meta").then(setM).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const setup = async () => {
    setBusy(true); setError("");
    try { await api("/api/setup", { method: "POST", body: "{}" }); await load(); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };
  const enter = async (memberId: string) => {
    setBusy(true);
    try { await api("/api/session", { method: "POST", body: JSON.stringify({ ds, memberId }) }); sessionStorage.removeItem("gc-view"); router.replace("/"); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };
  const people = (m?.members || []).filter((x) => x.ds === ds);
  const heads = people.filter((x) => x.role === "head"), mems = people.filter((x) => x.role === "member");

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Growth Center</h1>
          <p className="mt-1 text-sm text-slate-500">The sponsorship team&apos;s command center: targets, pipeline, tasks, payments, meeting notes and an AI copilot.</p>
        </div>
        {error && <div className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">{error}</div>}
        {!m && <p className="mt-8 text-center text-sm text-slate-500">Loading…</p>}
        {m && !m.setup && (
          <div className="mx-auto mt-8 max-w-lg rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="font-semibold">First-time setup</h2>
            <p className="mt-1 text-sm text-slate-500">{m.dbError ? m.dbError : "The database is empty. This creates the tables and loads both datasets (original CampusFest 2025 and simulated GEF Mumbai)."}</p>
            <Button kind="primary" className="mt-3" onClick={setup} disabled={busy || !!m.dbError}>{busy ? "Setting up…" : "Create tables and load data"}</Button>
          </div>
        )}
        {m?.setup && (
          <>
            <div className="mx-auto mt-8 flex max-w-xl rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
              {m.datasets!.map((d) => (
                <button key={d.id} onClick={() => setDs(d.id)} className={cx("flex-1 rounded-lg px-3 py-2 text-left transition", ds === d.id ? "bg-indigo-600 text-white" : "hover:bg-slate-50 dark:hover:bg-slate-800")}>
                  <div className="text-sm font-medium">{d.simulated ? "GEF Mumbai 2027" : "CampusFest 2025"}</div>
                  <div className={cx("text-[11px]", ds === d.id ? "text-indigo-100" : "text-slate-500")}>{d.simulated ? "Simulated from our plan" : "Original dataset from the brief"}</div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">{m.datasets!.find((d) => d.id === ds)?.description}</p>

            <div className="mt-8 grid gap-5 md:grid-cols-[1fr_1.4fr]">
              <section className="rounded-2xl border-2 border-indigo-200 bg-white p-5 dark:border-indigo-900 dark:bg-slate-900">
                <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Heads</h2><Badge tone="indigo">full view</Badge></div>
                <p className="mt-1 text-xs text-slate-500">Team targets, cash, every strategy and its status, all payments. Assign work and approve AI tasks.</p>
                <div className="mt-4 space-y-2">
                  {heads.map((h) => (
                    <button key={h.id} disabled={busy} onClick={() => enter(h.id)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-700 dark:hover:bg-indigo-950">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">{initials(h.name)}</span>
                      <span><span className="block text-sm font-medium">{h.name}</span><span className="block text-xs text-slate-500">{h.title?.replace(/^Head \d: /, "Leads ") || "Head"}</span></span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Members</h2><Badge>own work</Badge></div>
                <p className="mt-1 text-xs text-slate-500">Personal goals and alerts, their companies, meeting notes. Can see who covers which sector, but not team cash or status.</p>
                <div className="scroll-thin mt-4 grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2">
                  {mems.map((h) => (
                    <button key={h.id} disabled={busy} onClick={() => enter(h.id)} className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-2.5 text-left transition hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-700 dark:hover:bg-indigo-950">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">{initials(h.name)}</span>
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{h.name}</span><span className="block truncate text-[11px] text-slate-500">{h.sector_group || "Festival team member"}</span></span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
            <p className="mt-6 text-center text-xs text-slate-400">Demo accounts, no password. GEF Mumbai companies and people are fictional. CampusFest 2025 is the original dataset, unchanged except for removing exact duplicate rows.</p>
          </>
        )}
      </div>
    </div>
  );
}
