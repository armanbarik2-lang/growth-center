"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { api, inr, pct, fdt } from "@/lib/fmt";
import { useApp } from "@/components/shell";
import { Card, Stat, StatusChip, Button, Tip, Badge, Empty } from "@/components/ui";
import { NoteCard, NoteComposer, NoteRow } from "@/components/notes";

type Camp = { id: string; name: string; kind: string; owner_name: string; rank: number | null; pact_score: number | null; contacted: number;
  meetings_reached: number; signed: number; signed_value: number; budget: number | null; spent: number | null; sends: number; replies: number;
  pays_after_fest: boolean; status: { status: string; signal: string; detail: string; action: string } };
type D = {
  dataset: { id: string; simulated: boolean; prob_source: string };
  week: number; fest_week: number;
  kpis: { signed_deals: number; signed_cash: number; signed_inkind: number; weighted_pipeline: number; projected_signed_cash: number;
    collected: number | null; due_before_fest: number | null; overdue: number | null; projected_before_fest: number | null; payments_note: string; budget: number | null; spent: number | null };
  funnel: { key: string; label: string; reached: number }[];
  steps: { from: string; to: string; rate: number | null }[];
  weekly: { week: number; signed: number; goal_pace: number | null }[];
  targets: { version: string; note: string; items: { label: string; goal: number; actual: number | null; pace: number | null }[] }[];
  campaigns: Camp[];
  alerts: { overdue_tasks: number; silent_leads: number; payments_due: number };
};
type W = {
  week: number; fest_week: number;
  goals: { label: string; actual: number; goal: number; pace: number }[];
  counts: { connected: number; not_connected: number; total: number; to_call: number };
  alerts: { kind: string; text: string; sub: string; ref: { type: string; id: string } }[];
  sectors: { id: string; name: string; role: string; sector_group: string | null; approached: string; meetings_14d: string }[];
  meetings: { occurred_at: string; company: string; company_id: string; member: string; strategy: string | null }[];
};

function Progress({ goal, actual, pace, money }: { goal: number; actual: number | null; pace: number | null; money?: boolean }) {
  const a = actual ?? 0, w = Math.min(100, (a / Math.max(1, goal)) * 100), p = pace === null ? null : Math.min(100, (pace / Math.max(1, goal)) * 100);
  const behind = pace !== null && a < pace;
  const f = (v: number) => (money ? inr(v) : String(v));
  return (
    <div>
      <div className="relative h-2.5 rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-2.5 rounded-full ${behind ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${w}%` }} />
        {p !== null && <div className="absolute top-[-3px] h-4 w-0.5 bg-slate-500" style={{ left: `${p}%` }} title="Where we should be by now" />}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500 num">
        <span>{actual === null ? "n/a" : f(a)} of {f(goal)}</span>
        {pace !== null && <span className={behind ? "text-amber-600" : "text-emerald-600"}>{behind ? "behind" : "on or ahead of"} pace ({f(pace)})</span>}
      </div>
    </div>
  );
}

function HeadOverview() {
  const { view, tick, openCopilot, meta } = useApp();
  const [d, setD] = useState<D | null>(null);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => { api<D>(`/api/dashboard${view ? `?owner=${encodeURIComponent(view)}` : ""}`).then(setD).catch((e) => setErr(e.message)); }, [view, tick]);
  useEffect(() => { api<NoteRow[]>("/api/notes?kind=mom").then((r) => setNotes(r.slice(0, 3))).catch(() => {}); }, [tick]);
  if (err) return <div className="text-sm text-rose-600">{err}</div>;
  if (!d) return <div className="text-sm text-slate-500">Loading overview…</div>;
  const k = d.kpis;
  const top = d.funnel[0]?.reached || 1;
  const worst = d.steps.filter((s) => s.rate !== null).sort((a, b) => a.rate! - b.rate!)[0];
  const flagged = d.campaigns.filter((c) => c.status.status === "amber" || c.status.status === "red");
  const viewName = view ? meta.members.find((m) => m.id === view)?.name : null;
  const base = d.targets[0]?.items.find((i) => i.label.startsWith("Cash before"));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Overview</h1>
          <p className="text-sm text-slate-500">Outreach week {d.week}{d.week > d.fest_week ? " (after the fest)" : ` of ${d.fest_week - 1}`}{viewName ? ` · showing ${viewName}'s share` : " · whole team"}</p>
        </div>
        <Button kind="primary" onClick={() => openCopilot("Give me a 5-line status for this week: are we on track, what is the bottleneck, and what should we do next?")}>✦ Explain this week</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Signed cash" value={inr(k.signed_cash)} sub={`${k.signed_deals} deals signed${k.signed_inkind ? ` · ${inr(k.signed_inkind)} in-kind kept separate` : ""}`} />
        <Stat label="Cash before fest (projected)" value={k.projected_before_fest === null ? "n/a" : inr(k.projected_before_fest)} tone={k.projected_before_fest === null ? "muted" : undefined}
          sub={<span>{k.projected_before_fest === null ? "No payment records in this dataset" : base ? `base goal ${inr(base.goal)}` : ""} <Tip>{k.payments_note}</Tip></span>} />
        <Stat label="Collected so far" value={k.collected === null ? "n/a" : inr(k.collected)} tone={k.collected === null ? "muted" : "good"}
          sub={k.overdue ? <span className="text-rose-600">{inr(k.overdue)} overdue</span> : k.collected === null ? "No payment records" : "nothing overdue"} />
        <Stat label="Budget used" value={k.budget === null ? "n/a" : `${inr(k.spent)} of ${inr(k.budget)}`} tone={k.budget === null ? "muted" : undefined} sub={k.budget === null ? "No budget in this dataset" : `${pct((k.spent || 0) / (k.budget || 1), 0)} used`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Targets vs pace" sub="Tick = where we should be today">
          {view ? <p className="text-xs text-slate-500">Targets are team goals. Switch to Whole team to compare.</p> : (
            <div className="space-y-4">
              {d.targets.map((t) => (
                <div key={t.version}>
                  <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold">{t.version} <Tip>{t.note}</Tip></div>
                  <div className="space-y-2.5">{t.items.map((it) => (
                    <div key={it.label}><div className="mb-0.5 text-xs text-slate-600 dark:text-slate-300">{it.label.replace(" (₹)", "").replace(" (₹, projected)", " (projected)")}</div><Progress goal={it.goal} actual={it.actual} pace={it.pace} money={it.label.includes("₹")} /></div>
                  ))}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Funnel" sub="Deals that reached each stage, and the share that moved on">
          <div className="space-y-1.5">
            {d.funnel.map((f, i) => (
              <div key={f.key}>
                <div className="flex justify-between text-xs"><span>{f.label}</span><span className="num font-medium">{f.reached}{i > 0 && d.funnel[i - 1].reached ? <span className="ml-1 text-slate-400">({pct(f.reached / d.funnel[i - 1].reached, 0)})</span> : null}</span></div>
                <div className="h-2 rounded bg-slate-100 dark:bg-slate-800"><div className="h-2 rounded bg-indigo-500" style={{ width: `${Math.max(1, (f.reached / top) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          {worst && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">Biggest drop: {worst.from} → {worst.to} ({pct(worst.rate)} move on). <button className="underline" onClick={() => openCopilot(`Our biggest funnel drop is ${worst.from} to ${worst.to}. Why, and what should we change?`)}>Ask AI why</button></p>}
        </Card>

        <Card title="Deals signed by week" sub="Against straight-line pace to the stretch target">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.weekly} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} tickFormatter={(w) => `W${w}`} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v, n) => [String(v ?? ""), n === "signed" ? "Deals signed" : "Pace"]} labelFormatter={(w) => `Week ${w}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(n) => (n === "signed" ? "Deals signed" : "Pace")} />
                <Line type="linear" dataKey="signed" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="linear" dataKey="goal_pace" stroke="#94a3b8" strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Strategies" sub={view ? "This person's share; status is the team-level line" : "Status = each strategy's pre-agreed scale, change or stop line"} pad={false}
        right={<Link href="/strategies" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">Open strategies →</Link>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="px-4 py-2">Strategy</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Signal</th>
              <th className="px-2 py-2 text-right">Contacted</th><th className="px-2 py-2 text-right">Meetings</th><th className="px-2 py-2 text-right">Signed</th>
              <th className="px-2 py-2 text-right">Signed cash</th><th className="px-4 py-2 text-right">Budget used</th></tr></thead>
            <tbody>
              {d.campaigns.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2"><Link href={`/strategies?id=${encodeURIComponent(c.id)}`} className="font-medium hover:underline">{c.rank ? `${c.rank}. ` : ""}{c.name}</Link>
                    <div className="text-xs text-slate-500">{c.owner_name}{c.kind === "base" ? " · base outreach" : ""}{c.pays_after_fest ? " · pays after fest" : ""}</div></td>
                  <td className="px-2 py-2"><StatusChip s={c.status.status} /></td>
                  <td className="px-2 py-2 text-xs text-slate-600 dark:text-slate-300">{c.status.signal}</td>
                  <td className="num px-2 py-2 text-right">{c.sends ? `${c.sends} emails` : c.contacted}</td>
                  <td className="num px-2 py-2 text-right">{c.meetings_reached}</td>
                  <td className="num px-2 py-2 text-right">{c.signed}</td>
                  <td className="num px-2 py-2 text-right">{inr(c.signed_value)}</td>
                  <td className="num px-4 py-2 text-right">{c.budget === null ? <span className="text-slate-400">n/a</span> : `${inr(c.spent)} / ${inr(c.budget)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Needs attention">
          <ul className="space-y-2 text-sm">
            {flagged.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2">
                <div><StatusChip s={c.status.status} /> <span className="font-medium">{c.name}</span>: {c.status.signal}<div className="text-xs text-slate-500">Agreed action: {c.status.action}</div></div>
                <Button size="sm" onClick={() => openCopilot(`${c.name} is at ${c.status.status} (${c.status.signal}). Diagnose it with the data and propose tasks for the agreed action.`)}>✦ Act</Button>
              </li>
            ))}
            <li className="flex justify-between"><span>Leads silent 3+ weeks (switch contact)</span><Badge tone={d.alerts.silent_leads ? "amber" : "green"}>{d.alerts.silent_leads}</Badge></li>
            <li className="flex justify-between"><span>Overdue tasks</span><Badge tone={d.alerts.overdue_tasks ? "red" : "green"}>{d.alerts.overdue_tasks}</Badge></li>
            <li className="flex justify-between"><span>Payments due within 7 days or overdue</span><Badge tone={d.alerts.payments_due ? "amber" : "green"}>{d.alerts.payments_due}</Badge></li>
          </ul>
        </Card>
        <Card title="Latest meeting notes" right={<Link href="/updates" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">All notes →</Link>}>
          {notes.length === 0 ? <Empty>No meeting notes yet.</Empty> : <div className="space-y-2">{notes.map((n) => <NoteCard key={n.id} n={n} />)}</div>}
        </Card>
      </div>
      <p className="text-[11px] text-slate-400">Signed = deals at the signed stage or later; in-kind is never counted as cash. Funnel counts each deal at the furthest stage it reached. Projections use stage probabilities: {d.dataset.prob_source}</p>
    </div>
  );
}

function MyWork() {
  const { me, tick } = useApp();
  const router = useRouter();
  const [w, setW] = useState<W | null>(null);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [compose, setCompose] = useState(false);
  useEffect(() => { api<W>("/api/mywork").then(setW).catch(() => {}); }, [tick]);
  useEffect(() => { api<NoteRow[]>("/api/notes").then((r) => setNotes(r.filter((n) => n.kind !== "remark").slice(0, 4))).catch(() => {}); }, [tick]);
  if (!w) return <div className="text-sm text-slate-500">Loading your work…</div>;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-xl font-semibold">My work</h1>
          <p className="text-sm text-slate-500">{me.name}{me.sector_group ? ` · ${me.sector_group}` : ""} · outreach week {w.week} of {w.fest_week - 1}</p></div>
        <Button kind="primary" onClick={() => setCompose(true)}>+ Meeting notes</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="My goals" sub="From the GES funnel: call every company; about 10% become good leads, 5% meetings, 1% deals" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            {w.goals.map((g) => <div key={g.label}><div className="mb-0.5 text-xs font-medium">{g.label}</div><Progress goal={g.goal} actual={g.actual} pace={g.pace} /></div>)}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <button onClick={() => router.push(`/pipeline?owner=${me.id}&stage=prospect`)} className="rounded-lg bg-slate-50 p-2 hover:bg-slate-100 dark:bg-slate-800/60"><div className="num text-lg font-semibold">{w.counts.to_call}</div><div className="text-[11px] text-slate-500">still to call</div></button>
            <button onClick={() => router.push(`/pipeline?owner=${me.id}&stage=call_attempted`)} className="rounded-lg bg-amber-50 p-2 hover:bg-amber-100 dark:bg-amber-950/40"><div className="num text-lg font-semibold text-amber-700 dark:text-amber-300">{w.counts.not_connected}</div><div className="text-[11px] text-slate-500">not connected: find new contact</div></button>
            <button onClick={() => router.push(`/pipeline?owner=${me.id}`)} className="rounded-lg bg-slate-50 p-2 hover:bg-slate-100 dark:bg-slate-800/60"><div className="num text-lg font-semibold">{w.counts.connected}</div><div className="text-[11px] text-slate-500">connected so far</div></button>
          </div>
        </Card>
        <Card title="Needs you" sub="Updates live">
          {w.alerts.length === 0 ? <Empty>All clear.</Empty> : (
            <ul className="space-y-1.5">{w.alerts.slice(0, 8).map((a, i) => (
              <li key={i} className="text-sm"><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${a.kind === "overdue" ? "bg-rose-500" : a.kind === "silent" ? "bg-amber-500" : a.kind === "note" ? "bg-violet-500" : "bg-indigo-400"}`} />{a.text}<div className="ml-3.5 text-xs text-slate-500">{a.sub}</div></li>
            ))}</ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Team updates" right={<Link href="/updates" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">All →</Link>}>
          {notes.length === 0 ? <Empty>No updates yet.</Empty> : <div className="space-y-2">{notes.map((n) => <NoteCard key={n.id} n={n} />)}</div>}
        </Card>
        <Card title="Recent meetings across the team" sub="So you know who is already talking to whom">
          {w.meetings.length === 0 ? <Empty>No meetings yet.</Empty> : (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">{w.meetings.map((m, i) => (
              <li key={i} className="flex justify-between gap-2 py-1.5"><span>{m.company}<span className="text-xs text-slate-500"> · {m.member}</span></span><span className="text-xs text-slate-500">{fdt(m.occurred_at)}</span></li>
            ))}</ul>
          )}
        </Card>
      </div>

      <Card title="Who covers which sector" sub="Check here before approaching a company outside your sector group" pad={false}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500"><tr className="border-b border-slate-100 dark:border-slate-800"><th className="px-4 py-2">Person</th><th className="px-2 py-2">Sector group</th><th className="px-2 py-2 text-right">Companies approached</th><th className="px-4 py-2 text-right">Meetings (14 days)</th></tr></thead>
          <tbody>{w.sectors.map((s) => (
            <tr key={s.id} className="border-b border-slate-50 dark:border-slate-800/50">
              <td className="px-4 py-1.5">{s.name} {s.role === "head" && <Badge tone="indigo">head</Badge>}</td>
              <td className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300">{s.sector_group || "Strategy lead"}</td>
              <td className="num px-2 py-1.5 text-right">{s.approached}</td><td className="num px-4 py-1.5 text-right">{s.meetings_14d}</td></tr>
          ))}</tbody>
        </table>
      </Card>
      <NoteComposer open={compose} onClose={() => setCompose(false)} />
    </div>
  );
}

export default function Home() {
  const { isHead } = useApp();
  return isHead ? <HeadOverview /> : <MyWork />;
}
