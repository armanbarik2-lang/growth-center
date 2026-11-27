"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, fdate } from "@/lib/fmt";
import { cx, Badge } from "./ui";
import { CopilotPanel } from "./copilot";

export type Stage = { key: string; label: string; kind: string; funnel_label?: string };
export type Member = { id: string; ds: string; name: string; role: "head" | "member"; sector_group: string | null; title: string | null };
export type Meta = {
  setup: boolean; ai: boolean;
  datasets: { id: string; name: string; simulated: boolean; description: string }[];
  members: Member[];
  ctx: null | { ds: { id: string; name: string; simulated: boolean; stages: Stage[]; won_stage: string; fest_start: string; fest_end: string; outreach_start: string; as_of: string | null; prob_source: string; stage_prob: Record<string, number | null> }; me: Member; today: string; week: number };
};
type Note = { kind: string; text: string; sub: string; ref: { type: string; id: string } };
type AppCtx = {
  meta: Meta; me: Member; isHead: boolean; members: Member[]; heads: Member[]; stages: Stage[];
  view: string; setView: (v: string) => void;   // heads only: "" = everyone, else member id
  tick: number; refresh: () => void;
  canEdit: (ownerId: string | null | undefined) => boolean;
  openCopilot: (prompt?: string) => void;
};
const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => useContext(Ctx)!;

/** Heads can reload both datasets to their original state (undoes every edit, for every user). */
function ResetDemo() {
  const [state, setState] = useState<"idle" | "ask" | "busy" | "done" | "error">("idle");
  const run = async () => {
    setState("busy");
    try { await api("/api/setup", { method: "POST", body: "{}" }); setState("done"); setTimeout(() => window.location.reload(), 800); }
    catch { setState("error"); }
  };
  if (state === "ask") return (
    <div className="mt-2 rounded-md bg-amber-50 p-2 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
      Reload both datasets and undo every change made in the app?
      <div className="mt-1 flex gap-3"><button onClick={run} className="font-semibold underline">Yes, reset</button><button onClick={() => setState("idle")} className="underline">Cancel</button></div>
    </div>);
  return (
    <button onClick={() => setState("ask")} disabled={state === "busy"} className="mt-1 block text-slate-500 hover:underline disabled:opacity-50">
      {state === "busy" ? "Resetting demo data…" : state === "done" ? "Demo data reset" : state === "error" ? "Reset failed, try again" : "Reset demo data"}
    </button>);
}

const NAV_HEAD = [
  { href: "/", label: "Overview", icon: "▦" },
  { href: "/strategies", label: "Strategies", icon: "◎" },
  { href: "/pipeline", label: "Pipeline", icon: "⇶" },
  { href: "/outreach", label: "Email sequences", icon: "✉" },
  { href: "/tasks", label: "Tasks", icon: "☑" },
  { href: "/payments", label: "Payments & deliverables", icon: "₹" },
  { href: "/updates", label: "Meeting notes & updates", icon: "🗒" },
  { href: "/copilot", label: "AI copilot", icon: "✦" },
];
const NAV_MEMBER = [
  { href: "/", label: "My work", icon: "▦" },
  { href: "/pipeline", label: "Pipeline", icon: "⇶" },
  { href: "/outreach", label: "Email sequences", icon: "✉" },
  { href: "/tasks", label: "Tasks", icon: "☑" },
  { href: "/payments", label: "My deals & deliverables", icon: "₹" },
  { href: "/updates", label: "Meeting notes & updates", icon: "🗒" },
  { href: "/copilot", label: "AI copilot", icon: "✦" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [view, setViewState] = useState<string>("");
  const [tick, setTick] = useState(0);
  const [panel, setPanel] = useState(false);
  const [seed, setSeed] = useState<string | undefined>();
  const [dark, setDark] = useState(false);
  const [bell, setBell] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [toast, setToast] = useState<Note | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const router = useRouter();
  const path = usePathname();

  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  useEffect(() => {
    api<Meta>("/api/meta").then((m) => {
      if (!m.setup || !m.ctx) { router.replace("/login"); return; }
      setMeta(m);
      const saved = sessionStorage.getItem("gc-view");
      setViewState(m.ctx.me.role === "head" && saved !== null ? saved : "");
    }).catch(() => router.replace("/login"));
  }, [router]);

  // live alerts: poll every 20 s; pop a toast when a new meeting note or update arrives
  useEffect(() => {
    if (!meta?.ctx) return;
    let alive = true;
    const load = () => api<{ items: Note[] }>("/api/notifications").then((r) => {
      if (!alive) return;
      setNotes(r.items);
      const ids = r.items.filter((n) => n.kind === "note").map((n) => n.ref.id);
      if (seen.current) { const fresh = r.items.find((n) => n.kind === "note" && !seen.current!.has(n.ref.id)); if (fresh) setToast(fresh); }
      seen.current = new Set(ids);
    }).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [meta, tick]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 7000); return () => clearTimeout(t); } }, [toast]);

  const setView = (v: string) => { setViewState(v); sessionStorage.setItem("gc-view", v); };
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const openCopilot = useCallback((p?: string) => { setSeed(p); setPanel(true); }, []);
  if (!meta?.ctx) return <div className="flex h-screen items-center justify-center text-sm text-slate-500">Loading Growth Center…</div>;
  const me = meta.ctx.me, isHead = me.role === "head";
  const NAV = isHead ? NAV_HEAD : NAV_MEMBER;
  const members = meta.members.filter((m) => m.ds === meta.ctx!.ds.id);
  const heads = members.filter((m) => m.role === "head");
  const canEdit = (o: string | null | undefined) => isHead || (!!o && o === me.id);
  const toggleDark = () => { const n = !dark; setDark(n); document.documentElement.classList.toggle("dark", n); localStorage.setItem("gc-theme", n ? "dark" : "light"); };
  const signOut = async () => { await api("/api/session", { method: "DELETE" }); sessionStorage.removeItem("gc-view"); router.replace("/login"); };
  const urgent = notes.filter((n) => ["overdue", "silent", "note"].includes(n.kind)).length;
  const go = (n: Note) => {
    setBell(false);
    const r = n.ref;
    router.push(r.type === "task" ? "/tasks" : r.type === "payment" ? "/payments" : r.type === "campaign" ? `/strategies?id=${encodeURIComponent(r.id)}`
      : r.type === "deal" ? `/pipeline?deal=${encodeURIComponent(r.id)}` : r.type === "note" ? "/updates" : r.type === "stage" ? `/pipeline?stage=${r.id}` : r.type === "outreach" ? `/outreach${r.id ? "?tab=" + r.id : ""}` : "/tasks");
  };
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <Ctx.Provider value={{ meta, me, isHead, members, heads, stages: meta.ctx.ds.stages, view, setView, tick, refresh, canEdit, openCopilot }}>
      <div className="flex h-screen overflow-hidden">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:flex">
          <div className="px-4 py-4">
            <div className="text-[15px] font-semibold">Growth Center</div>
            <div className="text-xs text-slate-500">Sponsorship command center</div>
          </div>
          <nav className="flex-1 space-y-0.5 px-2">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={cx("flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                active(n.href) ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800")}>
                <span className="w-4 text-center">{n.icon}</span>{n.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-slate-100 p-3 text-xs text-slate-500 dark:border-slate-800">
            <div className="flex items-center gap-2"><span className="font-medium text-slate-700 dark:text-slate-200">{me.name}</span><Badge tone={isHead ? "indigo" : "slate"}>{isHead ? "Head" : "Member"}</Badge></div>
            {me.sector_group && <div className="mt-0.5">{me.sector_group}</div>}
            <button onClick={signOut} className="mt-2 text-indigo-600 hover:underline dark:text-indigo-400">Switch user or dataset</button>
            {isHead && <ResetDemo />}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex min-w-0 items-center gap-2">
              <Badge tone={meta.ctx.ds.simulated ? "violet" : "green"}>{meta.ctx.ds.simulated ? "SIMULATED" : "ORIGINAL DATA"}</Badge>
              <span className="truncate text-sm font-medium">{meta.ctx.ds.name}</span>
              <span className="hidden text-xs text-slate-500 lg:inline">· {meta.ctx.ds.as_of ? (meta.ctx.ds.simulated ? `demo clock ${fdate(meta.ctx.ds.as_of)}` : `snapshot ${fdate(meta.ctx.ds.as_of)}`) : `today ${fdate(meta.ctx.today)}`} · outreach week {meta.ctx.week} · fest {fdate(meta.ctx.ds.fest_start)}{meta.ctx.ds.fest_end && meta.ctx.ds.fest_end !== meta.ctx.ds.fest_start ? ` to ${fdate(meta.ctx.ds.fest_end)}` : ""}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {isHead && (
                <label className="flex items-center gap-1 text-xs text-slate-500">Showing
                  <select value={view} onChange={(e) => setView(e.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">
                    <option value="">Whole team</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role === "head" ? " (head)" : ""}</option>)}
                  </select>
                </label>
              )}
              <div className="relative">
                <button onClick={() => setBell(!bell)} className="relative rounded-lg px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Notifications">🔔
                  {urgent > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-rose-500 px-1 text-[10px] text-white">{urgent}</span>}
                </button>
                {bell && (
                  <div className="scroll-thin absolute right-0 z-50 mt-1 max-h-[70vh] w-96 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <div className="px-2 py-1 text-xs font-semibold text-slate-500">{isHead ? "Your alerts and team lines" : "Your work"}</div>
                    {notes.length === 0 && <div className="p-3 text-sm text-slate-500">Nothing needs you right now.</div>}
                    {notes.map((n, i) => (
                      <button key={i} onClick={() => go(n)} className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
                        <div className="flex items-center gap-2 text-sm">
                          <span className={cx("h-2 w-2 shrink-0 rounded-full", n.kind === "overdue" ? "bg-rose-500" : n.kind === "silent" ? "bg-amber-500" : n.kind === "note" ? "bg-violet-500" : "bg-indigo-400")} />
                          <span className="truncate">{n.text}</span>
                        </div>
                        <div className="ml-4 truncate text-xs text-slate-500">{n.sub}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={toggleDark} className="rounded-lg px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800" title="Light / dark mode">{dark ? "☀" : "☾"}</button>
              <button onClick={() => { setSeed(undefined); setPanel(!panel); }} className={cx("rounded-lg px-3 py-1 text-sm font-medium", panel ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300")}>✦ Ask AI</button>
            </div>
            <nav className="flex w-full gap-1 overflow-x-auto md:hidden">
              {NAV.map((n) => <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-800">{n.label}</Link>)}
            </nav>
          </header>
          <div className="flex min-h-0 flex-1">
            <main className="scroll-thin min-w-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
            {panel && path !== "/copilot" && (
              <aside className="flex w-full max-w-md shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <CopilotPanel compact seed={seed} onClose={() => setPanel(false)} page={NAV.find((n) => active(n.href))?.label} />
              </aside>
            )}
          </div>
        </div>
      </div>
      {toast && (
        <button onClick={() => { setToast(null); router.push("/updates"); }} className="fixed bottom-5 right-5 z-50 w-80 rounded-xl border border-violet-200 bg-white p-3 text-left shadow-xl dark:border-violet-800 dark:bg-slate-900">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-600">New update</div>
          <div className="text-sm font-medium">{toast.text}</div>
          <div className="text-xs text-slate-500">{toast.sub}</div>
        </button>
      )}
    </Ctx.Provider>
  );
}
