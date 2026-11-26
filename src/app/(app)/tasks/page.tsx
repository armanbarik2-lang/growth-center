"use client";
import { useEffect, useState } from "react";
import { api, istDay, fdate } from "@/lib/fmt";
import { useApp } from "@/components/shell";
import { Button, Modal, Field, inputCls, Badge, Empty, cx } from "@/components/ui";

type Task = { id: string; title: string; details: string | null; owner_id: string; owner_name: string; campaign_id: string | null; campaign_name: string | null;
  deal_name: string | null; due: string | null; status: string; priority: string; source: string; created_by_name: string | null; created_at: string };
type Camp = { id: string; name: string };

export default function Tasks() {
  const { view, tick, refresh, canEdit, members, me, meta, isHead } = useApp();
  const [mine, setMine] = useState<string>(isHead ? "" : me.id);
  const who = isHead ? view : mine;
  const [rows, setRows] = useState<Task[] | null>(null);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [show, setShow] = useState<"open" | "all">("open");
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<Task[]>(`/api/tasks${who ? `?owner=${encodeURIComponent(who)}` : ""}`).then(setRows).catch(() => setRows([])); }, [who, tick]);
  useEffect(() => { api<Camp[]>("/api/campaigns").then(setCamps).catch(() => {}); }, []);
  const today = istDay(meta.ctx!.today);
  const setStatus = async (t: Task, status: string) => { try { await api(`/api/tasks/${encodeURIComponent(t.id)}`, { method: "PATCH", body: JSON.stringify({ status }) }); refresh(); } catch (e) { alert((e as Error).message); } };
  const del = async (t: Task) => { if (!confirm(`Delete "${t.title}"?`)) return; try { await api(`/api/tasks/${encodeURIComponent(t.id)}`, { method: "DELETE" }); refresh(); } catch (e) { alert((e as Error).message); } };
  const save = async () => {
    setErr("");
    try {
      if (form!.id) await api(`/api/tasks/${encodeURIComponent(form!.id)}`, { method: "PATCH", body: JSON.stringify({ title: form!.title, details: form!.details, due_date: form!.due_date || null, owner_id: form!.owner_id, campaign_id: form!.campaign_id || null, priority: form!.priority }) });
      else await api("/api/tasks", { method: "POST", body: JSON.stringify({ ...form, due_date: form!.due_date || null, campaign_id: form!.campaign_id || null }) });
      setForm(null); refresh();
    } catch (e) { setErr((e as Error).message); }
  };
  if (!rows) return <div className="text-sm text-slate-500">Loading…</div>;
  const list = rows.filter((t) => show === "all" || t.status !== "done");
  const groups = [
    { k: "overdue", label: "Overdue", items: list.filter((t) => t.status !== "done" && t.due && t.due < today) },
    { k: "today", label: "Due in the next 3 days", items: list.filter((t) => t.status !== "done" && t.due && t.due >= today && t.due <= new Date(new Date(today).getTime() + 3 * 86400000).toISOString().slice(0, 10)) },
    { k: "later", label: "Later or no date", items: list.filter((t) => t.status !== "done" && (!t.due || t.due > new Date(new Date(today).getTime() + 3 * 86400000).toISOString().slice(0, 10))) },
    { k: "done", label: "Done", items: list.filter((t) => t.status === "done") },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-xl font-semibold">Tasks</h1><p className="text-sm text-slate-500">Owners, deadlines and action items. Tasks marked AI were suggested by the copilot and confirmed by a person.</p></div>
        <div className="flex gap-2">
          {!isHead && <select className={inputCls.replace("w-full ", "") + " w-44"} value={mine} onChange={(e) => setMine(e.target.value)}><option value={me.id}>My tasks</option><option value="">Everyone&apos;s</option>{members.filter((m) => m.id !== me.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
          <select className={inputCls.replace("w-full ", "") + " w-32"} value={show} onChange={(e) => setShow(e.target.value as "open" | "all")}><option value="open">Open</option><option value="all">All</option></select>
          <Button kind="primary" onClick={() => setForm({ title: "", details: "", due_date: "", owner_id: me.id, campaign_id: "", priority: "normal" })}>+ New task</Button>
        </div>
      </div>
      {groups.filter((g) => g.items.length).length === 0 && <Empty>No tasks here.</Empty>}
      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.k}>
          <h2 className={cx("mb-2 text-xs font-semibold uppercase tracking-wide", g.k === "overdue" ? "text-rose-600" : "text-slate-500")}>{g.label} ({g.items.length})</h2>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {g.items.map((t) => {
              const ed = canEdit(t.owner_id);
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <input type="checkbox" disabled={!ed} checked={t.status === "done"} onChange={() => setStatus(t, t.status === "done" ? "todo" : "done")} className="h-4 w-4 accent-indigo-600" />
                  <div className="min-w-0 flex-1">
                    <div className={cx("text-sm", t.status === "done" && "text-slate-400 line-through")}>{t.source === "ai" && <Badge tone="violet">AI</Badge>} {t.priority === "high" && <Badge tone="red">high</Badge>} {t.title}</div>
                    <div className="text-xs text-slate-500">{t.owner_name}{t.campaign_name ? ` · ${t.campaign_name}` : ""}{t.deal_name ? ` · ${t.deal_name}` : ""}{t.details ? ` · ${t.details}` : ""}</div>
                  </div>
                  <div className={cx("num text-xs", t.status !== "done" && t.due && t.due < today ? "font-medium text-rose-600" : "text-slate-500")}>{t.due ? fdate(t.due) : "no date"}</div>
                  <select disabled={!ed} value={t.status} onChange={(e) => setStatus(t, e.target.value)} className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-900"><option value="todo">To do</option><option value="doing">Doing</option><option value="done">Done</option></select>
                  {ed && <Button size="sm" kind="ghost" onClick={() => setForm({ id: t.id, title: t.title, details: t.details || "", due_date: t.due || "", owner_id: t.owner_id, campaign_id: t.campaign_id || "", priority: t.priority })}>Edit</Button>}
                  {ed && <Button size="sm" kind="ghost" onClick={() => del(t)}>✕</Button>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit task" : "New task"}>
        {form && <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field></div>
          <div className="sm:col-span-2"><Field label="Details"><input className={inputCls} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} /></Field></div>
          <Field label="Owner"><select disabled={me.role !== "head"} className={inputCls} value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
          <Field label="Due date"><input type="date" className={inputCls} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
          <Field label="Strategy"><select className={inputCls} value={form.campaign_id} onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}><option value="">None</option>{camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Priority"><select className={inputCls} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select></Field>
        </div>}
        {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
        <div className="mt-4 flex justify-end gap-2"><Button onClick={() => setForm(null)}>Cancel</Button><Button kind="primary" onClick={save} disabled={!form?.title}>Save</Button></div>
      </Modal>
    </div>
  );
}
