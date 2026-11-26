"use client";
import { useEffect, useState } from "react";
import { api, istDay, inr, fdate } from "@/lib/fmt";
import { useApp } from "@/components/shell";
import { Button, Stat, Badge, Empty, Card, inputCls } from "@/components/ui";
import { NoteComposer } from "@/components/notes";

type Deal = { id: string; name: string; stage: string; confirmed_value: string; support_type: string; package: string | null; owner_id: string; owner_name: string; campaign_name: string; pays_after_fest: boolean };
type Pay = { id: string; deal_id: string; kind: string; amount: string; due: string; paid_at: string | null; status: string; note: string | null };
type Del = { id: string; deal_id: string; item: string; status: string; due: string | null };
type Rem = { id: string; deal_id: string; title: string; detail: string | null; created_at: string; author_name: string };
type Data = { deals: Deal[]; payments: Pay[]; deliverables: Del[]; remarks: Rem[]; fest_start: string; today: string };

function DealCard({ x, d, today }: { x: Deal; d: Data; today: string }) {
  const { canEdit, stages, refresh } = useApp();
  const [item, setItem] = useState("");
  const [remark, setRemark] = useState(false);
  const pays = d.payments.filter((p) => p.deal_id === x.id), dels = d.deliverables.filter((y) => y.deal_id === x.id), rems = d.remarks.filter((r) => r.deal_id === x.id);
  const ed = canEdit(x.owner_id);
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); refresh(); } catch (e) { alert((e as Error).message); } };
  const setPay = (p: Pay, status: string) => act(() => api(`/api/payments/${encodeURIComponent(p.id)}`, { method: "PATCH", body: JSON.stringify({ status }) }));
  const toggle = (y: Del) => act(() => api(`/api/deliverables/${encodeURIComponent(y.id)}`, { method: "PATCH", body: JSON.stringify({ status: y.status === "done" ? "pending" : "done" }) }));
  const remove = (y: Del) => { if (confirm(`Remove "${y.item}"?`)) act(() => api(`/api/deliverables/${encodeURIComponent(y.id)}`, { method: "DELETE" })); };
  const add = () => act(async () => { await api("/api/deliverables", { method: "POST", body: JSON.stringify({ deal_id: x.id, item }) }); setItem(""); });
  const done = dels.filter((y) => y.status === "done").length;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{x.name.replace(" x GEF Mumbai", "")}</span><Badge tone="green">{stages.find((s) => s.key === x.stage)?.label}</Badge>
            {x.package && <Badge tone="violet">{x.package}</Badge>}{x.support_type !== "cash" && <Badge tone="amber">in-kind</Badge>}{x.pays_after_fest && <Badge tone="amber">pays after fest</Badge>}</div>
          <div className="text-xs text-slate-500">{x.owner_name} · {x.campaign_name}</div>
        </div>
        <div className="num text-base font-semibold">{inr(Number(x.confirmed_value))}</div>
      </div>

      {rems.length > 0 && <div className="mt-3 space-y-1.5">{rems.map((r) => (
        <div key={r.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs dark:border-amber-900 dark:bg-amber-950/40">
          <span className="font-semibold text-amber-800 dark:text-amber-300">⚑ {r.title}</span>{r.detail ? <span className="text-slate-700 dark:text-slate-300">: {r.detail}</span> : null}
          <span className="text-slate-400"> · {r.author_name}</span>
        </div>))}</div>}

      {pays.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {pays.map((p) => {
          const late = p.status === "due" && p.due < today;
          return <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
            <span><span className="font-medium">{p.kind === "full" ? "Full payment" : p.kind === "advance" ? "50% advance" : "50% balance"}</span> {inr(Number(p.amount))} · due {fdate(p.due)} {p.status === "paid" ? <Badge tone="green">paid {fdate(p.paid_at)}</Badge> : p.status === "written_off" ? <Badge>written off</Badge> : late ? <Badge tone="red">overdue</Badge> : <Badge tone="amber">due</Badge>}</span>
            {ed && <span className="flex gap-1">{p.status !== "paid" && <Button size="sm" onClick={() => setPay(p, "paid")}>Mark paid</Button>}{p.status === "due" && <Button size="sm" kind="ghost" onClick={() => setPay(p, "written_off")}>Write off</Button>}{p.status !== "due" && <Button size="sm" kind="ghost" onClick={() => setPay(p, "due")}>Undo</Button>}</span>}
          </div>;
        })}
      </div>}

      <div className="mt-3">
        <div className="mb-1.5 text-xs font-semibold text-slate-500">DELIVERABLES {dels.length > 0 && <span className="font-normal">({done} of {dels.length} done)</span>}</div>
        {dels.length === 0 && <div className="text-xs text-slate-400">No deliverables recorded.</div>}
        <ul className="space-y-1">{dels.map((y) => (
          <li key={y.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={!ed} checked={y.status === "done"} onChange={() => toggle(y)} className="h-4 w-4 accent-indigo-600" />
            <span className={y.status === "done" ? "text-slate-400 line-through" : ""}>{y.item}</span>
            {y.due && <span className="text-xs text-slate-400">by {fdate(y.due)}</span>}
            {ed && <button onClick={() => remove(y)} className="ml-auto text-xs text-slate-300 hover:text-rose-600">✕</button>}
          </li>))}</ul>
        {ed && <div className="mt-2 flex flex-wrap gap-2">
          <input className={inputCls.replace("w-full ", "") + " min-w-0 flex-1"} placeholder="Add a deliverable, e.g. 2 judge seats at MAS" value={item} onChange={(e) => setItem(e.target.value)} />
          <Button size="sm" disabled={!item.trim()} onClick={add}>Add</Button>
          <Button size="sm" onClick={() => setRemark(true)}>⚑ Add remark</Button>
        </div>}
      </div>
      <NoteComposer open={remark} kind="remark" onClose={() => setRemark(false)} dealId={x.id} companyName={x.name} companyId={null} />
    </div>
  );
}

export default function Payments() {
  const { view, tick, openCopilot, isHead } = useApp();
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { api<Data>(`/api/payments${isHead && view ? `?owner=${encodeURIComponent(view)}` : ""}`).then(setD).catch(() => {}); }, [view, tick, isHead]);
  if (!d) return <div className="text-sm text-slate-500">Loading…</div>;
  const today = istDay(d.today);
  const sum = (f: (p: Pay) => boolean) => d.payments.filter(f).reduce((s, p) => s + Number(p.amount), 0);
  const signed = d.deals.reduce((s, x) => s + (x.support_type === "cash" ? Number(x.confirmed_value) : 0), 0);
  const noPay = d.payments.length === 0;
  const overdue = sum((p) => p.status === "due" && p.due < today);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-xl font-semibold">{isHead ? "Payments & deliverables" : "My deals & deliverables"}</h1>
          <p className="text-sm text-slate-500">Signed deals only. Terms: 50% advance, 50% after the branding report. Tick deliverables as they are done; ⚑ remarks hold special requirements such as guests needing rooms.</p></div>
        <Button onClick={() => openCopilot(isHead ? "Which payments are late or at risk, and what cash do we expect before the fest? Propose follow-up tasks." : "Which of my payments or deliverables need action this week?")}>✦ Check</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={isHead ? "Signed cash" : "My signed deals"} value={inr(signed)} sub={`${d.deals.length} deals`} />
        <Stat label="Collected" value={noPay ? "n/a" : inr(sum((p) => p.status === "paid"))} tone={noPay ? "muted" : "good"} />
        <Stat label="Due before the fest" value={noPay ? "n/a" : inr(sum((p) => p.status === "due" && p.due < d.fest_start))} tone={noPay ? "muted" : undefined} sub={`fest starts ${fdate(d.fest_start)}`} />
        <Stat label="Overdue" value={noPay ? "n/a" : inr(overdue)} tone={noPay ? "muted" : overdue ? "bad" : "good"} />
      </div>
      {noPay && d.deals.length > 0 && <Card><p className="text-sm text-slate-600 dark:text-slate-300">This dataset has no payment or deliverable records, so collected cash cannot be measured. You can still add deliverables and remarks to the signed deals below.</p></Card>}
      {d.deals.length === 0 ? <Empty>No signed deals yet.</Empty> : <div className="space-y-3">{d.deals.map((x) => <DealCard key={x.id} x={x} d={d} today={today} />)}</div>}
    </div>
  );
}
