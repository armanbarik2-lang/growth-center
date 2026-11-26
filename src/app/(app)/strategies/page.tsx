"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, inr, pct, fdate } from "@/lib/fmt";
import { useApp } from "@/components/shell";
import { Card, StatusChip, Button, Modal, Field, inputCls, Badge, Empty } from "@/components/ui";

type Camp = {
  id: string; name: string; kind: string; channel: string | null; owner_id: string | null; owner_name: string | null; rank: number | null;
  pact: { p: number; a: number; c: number; t: number } | null; pact_score: number | null; budget: number | null; spent: number | null;
  start_at: string | null; end_at: string | null; target_deals: number | null; target_value: number | null; test: string | null; kpi: string | null;
  rule: Record<string, unknown> | null; pays_after_fest: boolean; objective: string | null; audience: string | null;
  listed: number; contacted: number; attempts: number; responded: number; meetings: number; sends: number; bounces: number; replies: number;
  deals_total: number; deals_open: number; signed: number; signed_value: number; signed_cash: number; lost: number; pipeline_value: number; weighted_value: number;
  good_leads: number; meetings_reached: number; sanction_reached: number; contacted_first_n: number; good_leads_first_n: number; meetings_first_n: number;
  win_rate: number | null; response_rate: number | null; cost_per_signed: number | null;
  status: { status: string; signal: string; detail: string; action: string };
};
type Task = { id: string; title: string; status: string; due: string | null; owner_name: string; source: string };

const RULE_FIELDS: Record<string, { k: string; label: string }[]> = {
  base: [{ k: "prospects", label: "Prospects in the plan" }, { k: "weeks", label: "Outreach weeks" }],
  deal_by_week: [{ k: "week", label: "Test week" }, { k: "min_deals", label: "Deals needed by then" }],
  leads_per_n: [{ k: "n", label: "First N contacted" }, { k: "green", label: "Good leads to scale" }],
  meetings_per_n: [{ k: "n", label: "First N units" }, { k: "green", label: "Meetings to scale" }, { k: "stop_after", label: "Stop if 0 meetings after" }],
  title: [{ k: "green_week", label: "Signed by week (scale)" }, { k: "meeting_week", label: "Meeting by week (else stop)" }],
  gov: [{ k: "conv_week", label: "Conversations by week" }, { k: "conv_min", label: "Conversations needed" }, { k: "sanction_week", label: "Proposal in sanction by week" }],
  reply_rate: [{ k: "green", label: "Reply rate to scale (0.005 = 0.5%)" }, { k: "red_bounce", label: "Bounce rate to stop" }],
};

function Detail({ c, onSaved }: { c: Camp; onSaved: () => void }) {
  const { canEdit, members, openCopilot, tick } = useApp();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState<Record<string, unknown>>({});
  const [tasks, setTasks] = useState<Task[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => { api<Task[]>(`/api/tasks?campaign=${encodeURIComponent(c.id)}`).then(setTasks).catch(() => {}); }, [c.id, tick]);
  const editable = canEdit(c.owner_id);
  const ruleType = String(c.rule?.type || "");
  const open = () => { setF({ name: c.name, owner_id: c.owner_id, budget: c.budget ?? "", spent: c.spent ?? "", target_deals: c.target_deals ?? "", target_value: c.target_value ?? "", test: c.test ?? "", kpi: c.kpi ?? "", rule: { ...(c.rule || {}) } }); setEdit(true); setErr(""); };
  const save = async () => {
    try {
      const body: Record<string, unknown> = { ...f };
      for (const k of ["budget", "spent", "target_deals", "target_value"]) body[k] = body[k] === "" ? null : Number(body[k]);
      const rule = body.rule as Record<string, unknown>;
      for (const r of RULE_FIELDS[ruleType] || []) rule[r.k] = Number(rule[r.k]);
      await api(`/api/campaigns/${encodeURIComponent(c.id)}`, { method: "PATCH", body: JSON.stringify(body) });
      setEdit(false); onSaved();
    } catch (e) { setErr((e as Error).message); }
  };
  const stat = (l: string, v: React.ReactNode) => <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/60"><div className="text-[11px] text-slate-500">{l}</div><div className="num text-base font-semibold">{v}</div></div>;
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{c.rank ? `${c.rank}. ` : ""}{c.name}</h2><StatusChip s={c.status.status} long /></div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{c.objective}</p>
            <p className="text-xs text-slate-500">Owner {c.owner_name || "n/a"} · {c.channel} · {c.start_at ? `${fdate(c.start_at)} to ${fdate(c.end_at)}` : "no dates"}{c.audience ? ` · audience: ${c.audience}` : ""}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => openCopilot(`Analyse the "${c.name}" strategy: performance vs its test and target, bottleneck, and what to do next. Propose tasks if needed.`)}>✦ Analyse</Button>
            {editable && <Button kind="primary" onClick={open}>Edit</Button>}
          </div>
        </div>
        <div className={`mt-3 rounded-lg p-3 text-sm ${c.status.status === "green" ? "bg-emerald-50 dark:bg-emerald-950/40" : c.status.status === "amber" ? "bg-amber-50 dark:bg-amber-950/40" : c.status.status === "red" ? "bg-rose-50 dark:bg-rose-950/40" : "bg-slate-50 dark:bg-slate-800/50"}`}>
          <div><span className="font-medium">Signal:</span> {c.status.signal}{c.status.detail ? ` · ${c.status.detail}` : ""}</div>
          <div><span className="font-medium">Pre-agreed action:</span> {c.status.action}</div>
          {c.test && <div className="text-xs text-slate-500">Test: {c.test} · KPI: {c.kpi}</div>}
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {c.sends ? stat("Emails sent", c.sends) : stat("Companies listed", c.listed)}
        {c.sends ? stat("Replies", `${c.replies} (${pct(c.replies / c.sends)})`) : stat("Contacted", c.contacted)}
                {stat("Good leads", c.good_leads)}
        {stat("Meetings", c.meetings_reached)}
        {stat("Signed", `${c.signed} · ${inr(c.signed_value)}`)}
        {stat("Expected from open deals", inr(c.weighted_value))}
        {stat("Win rate (signed / contacted)", pct(c.win_rate))}
        {stat("Target", c.target_deals !== null ? `${c.target_deals} deals · ${inr(c.target_value)}` : "n/a")}
        {stat("Budget spent", c.budget === null ? "n/a" : `${inr(c.spent)} / ${inr(c.budget)}`)}
        {stat("Cost per signed deal", c.cost_per_signed === null ? "n/a" : inr(c.cost_per_signed))}
      </div>
      {c.pact && <Card title="PACT score" sub="Payout × Acceptance × Contact reach × Timing and certainty (each 1 to 5)">
        <div className="flex flex-wrap gap-3 text-sm">{(["p", "a", "c", "t"] as const).map((k) => <Badge key={k} tone="indigo">{{ p: "Payout", a: "Acceptance", c: "Contact", t: "Timing" }[k]} {c.pact![k]}</Badge>)}<Badge tone="violet">Score {c.pact_score}</Badge>{c.pays_after_fest && <Badge tone="amber">Most cash lands after the fest</Badge>}</div>
      </Card>}
      <Card title="Open tasks for this strategy" right={<Link className="text-xs text-indigo-600 hover:underline" href={`/pipeline?campaign=${encodeURIComponent(c.id)}`}>See its companies in Pipeline →</Link>}>
        {tasks.filter((t) => t.status !== "done").length === 0 ? <Empty>No open tasks.</Empty> :
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">{tasks.filter((t) => t.status !== "done").map((t) => <li key={t.id} className="flex justify-between py-1.5"><span>{t.source === "ai" && <Badge tone="violet">AI</Badge>} {t.title}</span><span className="text-xs text-slate-500">{t.owner_name} · {t.due ? fdate(t.due) : "no date"}</span></li>)}</ul>}
      </Card>
      <Modal open={edit} onClose={() => setEdit(false)} title={`Edit ${c.name}`} wide>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><input className={inputCls} value={String(f.name ?? "")} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Owner"><select className={inputCls} value={String(f.owner_id ?? "")} onChange={(e) => setF({ ...f, owner_id: e.target.value })}>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
          <Field label="Budget (₹)"><input className={inputCls} type="number" value={String(f.budget ?? "")} onChange={(e) => setF({ ...f, budget: e.target.value })} /></Field>
          <Field label="Spent so far (₹)"><input className={inputCls} type="number" value={String(f.spent ?? "")} onChange={(e) => setF({ ...f, spent: e.target.value })} /></Field>
          <Field label="Target deals"><input className={inputCls} type="number" value={String(f.target_deals ?? "")} onChange={(e) => setF({ ...f, target_deals: e.target.value })} /></Field>
          <Field label="Target value (₹)"><input className={inputCls} type="number" value={String(f.target_value ?? "")} onChange={(e) => setF({ ...f, target_value: e.target.value })} /></Field>
          <Field label="Test"><input className={inputCls} value={String(f.test ?? "")} onChange={(e) => setF({ ...f, test: e.target.value })} /></Field>
          <Field label="KPI"><input className={inputCls} value={String(f.kpi ?? "")} onChange={(e) => setF({ ...f, kpi: e.target.value })} /></Field>
          {(RULE_FIELDS[ruleType] || []).map((r) => (
            <Field key={r.k} label={`Rule: ${r.label}`}><input className={inputCls} type="number" step="any" value={String((f.rule as Record<string, unknown>)?.[r.k] ?? "")}
              onChange={(e) => setF({ ...f, rule: { ...(f.rule as Record<string, unknown>), [r.k]: e.target.value } })} /></Field>
          ))}
        </div>
        {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
        <div className="mt-4 flex justify-end gap-2"><Button onClick={() => setEdit(false)}>Cancel</Button><Button kind="primary" onClick={save}>Save</Button></div>
      </Modal>
    </div>
  );
}

function NewCampaign({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const { members, me } = useApp();
  const [f, setF] = useState<Record<string, string>>({ name: "", channel: "email", owner_id: me.id, budget: "", target_deals: "", target_value: "", test: "", kpi: "", start_at: "", end_at: "", objective: "" });
  const [err, setErr] = useState("");
  const save = async () => {
    try {
      const r = await api<{ id: string }>("/api/campaigns", { method: "POST", body: JSON.stringify({ ...f, kind: "bet", budget: f.budget ? Number(f.budget) : null, target_deals: f.target_deals ? Number(f.target_deals) : null, target_value: f.target_value ? Number(f.target_value) : null, start_at: f.start_at || null, end_at: f.end_at || null }) });
      onDone(r.id);
    } catch (e) { setErr((e as Error).message); }
  };
  const fld = (k: string, l: string, t = "text") => <Field label={l}><input className={inputCls} type={t} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>;
  return (
    <Modal open={open} onClose={onClose} title="New strategy" wide>
      <div className="grid gap-3 sm:grid-cols-2">
        {fld("name", "Name")}{fld("channel", "Channel")}
        <Field label="Owner"><select className={inputCls} value={f.owner_id} onChange={(e) => setF({ ...f, owner_id: e.target.value })}>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        {fld("budget", "Budget (₹)", "number")}{fld("target_deals", "Target deals", "number")}{fld("target_value", "Target value (₹)", "number")}
        {fld("start_at", "Start date", "date")}{fld("end_at", "End date", "date")}{fld("test", "Early test")}{fld("kpi", "KPI")}
        <div className="sm:col-span-2">{fld("objective", "What it is and why it could work")}</div>
      </div>
      <p className="mt-2 text-xs text-slate-500">New strategies use the default rule: green if its signed / contacted rate beats the team average, red if 0 signed after 20+ contacted.</p>
      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
      <div className="mt-4 flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button kind="primary" onClick={save}>Create</Button></div>
    </Modal>
  );
}

function BetsInner() {
  const { view, tick, refresh, isHead, meta } = useApp();
  const sp = useSearchParams(); const router = useRouter();
  useEffect(() => { if (!isHead) router.replace("/"); }, [isHead, router]);
  const [rows, setRows] = useState<Camp[] | null>(null);
  const [creating, setCreating] = useState(false);
  const id = sp.get("id");
  useEffect(() => { if (isHead) api<Camp[]>(`/api/campaigns${view ? `?owner=${encodeURIComponent(view)}` : ""}`).then(setRows).catch(() => setRows([])); }, [view, tick, isHead]);
  if (!isHead) return <div className="text-sm text-slate-500">Strategies are visible to heads. Taking you to My work…</div>;
  if (!rows) return <div className="text-sm text-slate-500">Loading…</div>;
  const sel = rows.find((r) => r.id === id) || null;
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div><h1 className="text-xl font-semibold">Strategies</h1><p className="text-sm text-slate-500">{meta.ctx!.ds.simulated ? "Our 5 ranked bets from the plan, plus base sector outreach and mass email." : "The 6 sponsor campaigns in the provided dataset."} Each has an early test and a pre-agreed line to scale, change or stop.{view ? " Numbers show the selected person's share." : ""}</p></div>
        <Button kind="primary" onClick={() => setCreating(true)}>+ New strategy</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          {rows.map((c) => (
            <button key={c.id} onClick={() => router.push(`/strategies?id=${encodeURIComponent(c.id)}`)}
              className={`block w-full rounded-xl border p-3 text-left transition ${sel?.id === c.id ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-950/50" : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"}`}>
              <div className="flex items-center justify-between gap-2"><span className="font-medium">{c.rank ? `${c.rank}. ` : ""}{c.name}</span><StatusChip s={c.status.status} /></div>
              <div className="mt-0.5 text-xs text-slate-500">{c.status.signal}</div>
              <div className="mt-1 text-xs text-slate-500 num">{c.signed} signed · {inr(c.signed_value)}</div>
            </button>
          ))}
        </div>
        <div>{sel ? <Detail c={sel} onSaved={refresh} /> : <Empty>Pick a strategy on the left to see its test, numbers and agreed actions.</Empty>}</div>
      </div>
      <NewCampaign open={creating} onClose={() => setCreating(false)} onDone={(nid) => { setCreating(false); refresh(); router.push(`/strategies?id=${encodeURIComponent(nid)}`); }} />
    </div>
  );
}

export default function Strategies() { return <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}><BetsInner /></Suspense>; }
