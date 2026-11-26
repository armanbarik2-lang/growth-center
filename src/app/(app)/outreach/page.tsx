"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, fdate, pct } from "@/lib/fmt";
import { useApp } from "@/components/shell";
import { Button, Card, Stat, Badge, Empty, Modal, Field, inputCls, cx } from "@/components/ui";

type QStep = { id: string; step_no: number; day: number; type: "email" | "call"; due: string; subject: string; body: string; enrollment_id: string; owner_id: string;
  owner_name: string; company: string; company_id: string; contact: string | null; email: string | null; contact_title: string | null; deal_id: string; stage: string; total_steps: string };
type Enr = { id: string; status: string; started_at: string; stop_reason: string | null; reply_outcome: string | null; owner_id: string; owner_name: string; company: string;
  company_id: string; contact: string | null; deal_id: string; sequence: string; total_steps: string; done_steps: string; emails_sent: string; next_due: string | null; next_type: string | null };
type Seq = { id: string; name: string; description: string; steps: { day: number; type: string; subject: string; body: string }[]; auto_start: boolean; switch_after_days: number };
type Data = { today: string; stats: Record<string, number>; queue: QStep[]; enrollments: Enr[]; sequences: Seq[]; eligible: { id: string; company: string; stage: string; owner_name: string }[] };

const ST: Record<string, { label: string; tone: "green" | "indigo" | "amber" | "slate" | "red" }> = {
  active: { label: "Running", tone: "indigo" }, replied: { label: "Replied", tone: "green" }, switch_contact: { label: "Need new contact", tone: "amber" },
  stopped: { label: "Stopped", tone: "slate" }, completed: { label: "Finished", tone: "slate" },
};

function ReplyModal({ enr, onClose }: { enr: { id: string; company: string } | null; onClose: () => void }) {
  const { refresh } = useApp();
  const [outcome, setOutcome] = useState("positive");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  if (!enr) return null;
  const save = async () => { try { await api(`/api/outreach/enrollments/${encodeURIComponent(enr.id)}`, { method: "POST", body: JSON.stringify({ action: "reply", outcome, note }) }); refresh(); onClose(); } catch (e) { setErr((e as Error).message); } };
  return (
    <Modal open onClose={onClose} title={`Reply received from ${enr.company}`}>
      <p className="text-sm text-slate-600 dark:text-slate-300">The sequence stops now and nothing more is sent automatically. A high-priority task is created for the owner to respond personally.</p>
      <div className="mt-3 space-y-1.5">
        {[["positive", "Interested (moves to Good lead)"], ["neutral", "Neutral or asked a question"], ["not_interested", "Not interested (moves to Lost)"]].map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="o" checked={outcome === k} onChange={() => setOutcome(k)} className="accent-indigo-600" />{l}</label>
        ))}
      </div>
      <div className="mt-3"><Field label="What did they say? (optional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
      <div className="mt-4 flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button kind="primary" onClick={save}>Stop sequence and create task</Button></div>
    </Modal>
  );
}

function SendModal({ step, onClose }: { step: QStep | null; onClose: () => void }) {
  const { refresh, meta } = useApp();
  const [subject, setSubject] = useState(step?.subject || "");
  const [body, setBody] = useState(step?.body || "");
  const [ins, setIns] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { setSubject(step?.subject || ""); setBody(step?.body || ""); setMsg(""); }, [step]);
  if (!step) return null;
  const act = async (action: string) => { try { await api(`/api/outreach/steps/${encodeURIComponent(step.id)}`, { method: "PATCH", body: JSON.stringify({ action, subject, body }) }); refresh(); if (action !== "save") onClose(); else setMsg("Draft saved."); } catch (e) { setMsg((e as Error).message); } };
  const polish = async () => { setBusy(true); setMsg(""); try { const r = await api<{ subject: string; body: string }>("/api/outreach/ai-draft", { method: "POST", body: JSON.stringify({ subject, body, instruction: ins, company: step.company }) }); setSubject(r.subject); setBody(r.body); setMsg("AI draft ready. Check it, then send."); } catch (e) { setMsg((e as Error).message); } setBusy(false); };
  const mailto = `mailto:${step.email || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <Modal open onClose={onClose} title={`${step.company} · step ${step.step_no} of ${step.total_steps}`} wide>
      <div className="space-y-3">
        <div className="text-xs text-slate-500">To {step.contact || "contact"}{step.contact_title ? `, ${step.contact_title}` : ""} · {step.email || "no email saved"} · due {fdate(step.due)}</div>
        <Field label="Subject"><input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Email"><textarea rows={11} className={inputCls} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
          <input className={inputCls.replace("w-full ", "") + " min-w-0 flex-1"} placeholder="Optional: tell AI what to change (e.g. mention the workshop)" value={ins} onChange={(e) => setIns(e.target.value)} />
          <Button size="sm" onClick={polish} disabled={busy || !meta.ai}>{busy ? "Drafting…" : "✦ Polish with AI"}</Button>
        </div>
        {msg && <p className="text-xs text-indigo-600 dark:text-indigo-300">{msg}</p>}
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex gap-2"><Button size="sm" kind="ghost" onClick={() => act("skip")}>Skip this step</Button><Button size="sm" kind="ghost" onClick={() => act("save")}>Save draft</Button></div>
          <div className="flex gap-2">
            <a href={mailto} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Open in email app</a>
            <Button kind="primary" onClick={() => act("sent")}>Mark as sent</Button>
          </div>
        </div>
        <p className="text-[11px] text-slate-400">The app prepares and tracks every email. Sending happens from your own email app; connecting Gmail or Outlook to send directly is a next step.</p>
      </div>
    </Modal>
  );
}

function StepsTimeline({ id }: { id: string }) {
  const [rows, setRows] = useState<{ id: string; step_no: number; day: number; type: string; due: string; status: string; subject: string; outcome: string | null }[] | null>(null);
  useEffect(() => { api<typeof rows>(`/api/outreach/enrollments/${encodeURIComponent(id)}`).then(setRows).catch(() => setRows([])); }, [id]);
  if (!rows) return <div className="p-2 text-xs text-slate-500">Loading…</div>;
  return (
    <ol className="space-y-1 p-2">{rows.map((s) => (
      <li key={s.id} className="flex items-center gap-2 text-xs">
        <span className={cx("h-2 w-2 shrink-0 rounded-full", s.status === "sent" || s.status === "done" ? "bg-emerald-500" : s.status === "skipped" ? "bg-slate-300" : "bg-indigo-300")} />
        <span className="w-14 text-slate-500">Day {s.day}</span><span className="w-10">{s.type === "email" ? "Email" : "Call"}</span>
        <span className={cx("flex-1 truncate", s.status === "skipped" && "text-slate-400 line-through")}>{s.subject}</span>
        <span className="text-slate-500">{s.status === "pending" ? `due ${fdate(s.due)}` : s.status === "done" ? (s.outcome || "done").replace("_", " ") : s.status}</span>
      </li>))}</ol>
  );
}

function AddModal({ open, onClose, d }: { open: boolean; onClose: () => void; d: Data }) {
  const { refresh } = useApp();
  const [sel, setSel] = useState<string[]>([]);
  const [seq, setSeq] = useState(d.sequences[0]?.id || "");
  const [msg, setMsg] = useState("");
  if (!open) return null;
  const save = async () => { try { const r = await api<{ enrolled: number; failed: string[] }>("/api/outreach/enroll", { method: "POST", body: JSON.stringify({ deal_ids: sel, sequence_id: seq }) }); setMsg(`Started for ${r.enrolled}.${r.failed.length ? " Skipped: " + r.failed.join("; ") : ""}`); setSel([]); refresh(); } catch (e) { setMsg((e as Error).message); } };
  return (
    <Modal open onClose={onClose} title="Start a sequence" wide>
      <Field label="Sequence"><select className={inputCls} value={seq} onChange={(e) => setSeq(e.target.value)}>{d.sequences.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>Companies you have spoken to, with no sequence running ({d.eligible.length})</span>
        <button className="text-indigo-600" onClick={() => setSel(sel.length ? [] : d.eligible.map((e) => e.id))}>{sel.length ? "Clear" : "Select all"}</button></div>
      <div className="scroll-thin mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
        {d.eligible.length === 0 ? <div className="p-3 text-sm text-slate-500">No eligible companies.</div> : d.eligible.map((e) => (
          <label key={e.id} className="flex items-center gap-2 border-b border-slate-50 px-3 py-1.5 text-sm dark:border-slate-800">
            <input type="checkbox" className="accent-indigo-600" checked={sel.includes(e.id)} onChange={(x) => setSel(x.target.checked ? [...sel, e.id] : sel.filter((y) => y !== e.id))} />
            {e.company}<span className="text-xs text-slate-500">· {e.owner_name} · {e.stage.replace(/_/g, " ")}</span></label>))}
      </div>
      {msg && <p className="mt-2 text-sm text-indigo-600">{msg}</p>}
      <div className="mt-4 flex justify-end gap-2"><Button onClick={onClose}>Close</Button><Button kind="primary" disabled={!sel.length} onClick={save}>Start for {sel.length || ""} {sel.length === 1 ? "company" : "companies"}</Button></div>
    </Modal>
  );
}

function StepEditor({ seq, onClose }: { seq: Seq | null; onClose: () => void }) {
  const { refresh } = useApp();
  const [steps, setSteps] = useState(seq?.steps || []);
  const [auto, setAuto] = useState(!!seq?.auto_start);
  const [days, setDays] = useState(seq?.switch_after_days || 21);
  const [err, setErr] = useState("");
  useEffect(() => { setSteps(seq?.steps || []); setAuto(!!seq?.auto_start); setDays(seq?.switch_after_days || 21); }, [seq]);
  if (!seq) return null;
  const upd = (i: number, k: string, v: string | number) => setSteps(steps.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const save = async () => { try { await api(`/api/outreach/sequences/${encodeURIComponent(seq.id)}`, { method: "PATCH", body: JSON.stringify({ steps: [...steps].sort((a, b) => a.day - b.day), auto_start: auto, switch_after_days: days }) }); refresh(); onClose(); } catch (e) { setErr((e as Error).message); } };
  return (
    <Modal open onClose={onClose} title={`Edit: ${seq.name}`} wide>
      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-indigo-600" />Start automatically when a proposal is mailed</label>
        <label className="flex items-center gap-2">Switch contact after <input type="number" className={inputCls.replace("w-full ", "") + " w-16"} value={days} onChange={(e) => setDays(Number(e.target.value))} /> days with no reply</label>
      </div>
      <p className="mb-2 text-xs text-slate-500">Placeholders: {"{{first_name}} {{company}} {{package}} {{sender}} {{fest}}"}. Changes apply to sequences started from now on.</p>
      <div className="scroll-thin max-h-[55vh] space-y-2 overflow-y-auto">
        {steps.map((s, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold">Step {i + 1}</span> Day <input type="number" className={inputCls.replace("w-full ", "") + " w-16"} value={s.day} onChange={(e) => upd(i, "day", Number(e.target.value))} />
              <select className={inputCls.replace("w-full ", "") + " w-24"} value={s.type} onChange={(e) => upd(i, "type", e.target.value)}><option value="email">Email</option><option value="call">Call</option></select>
              <button className="ml-auto text-slate-400 hover:text-rose-600" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>remove</button>
            </div>
            <input className={cx(inputCls, "mt-1.5")} value={s.subject} onChange={(e) => upd(i, "subject", e.target.value)} placeholder={s.type === "email" ? "Subject" : "Call purpose"} />
            <textarea rows={s.type === "email" ? 4 : 1} className={cx(inputCls, "mt-1.5")} value={s.body} onChange={(e) => upd(i, "body", e.target.value)} />
          </div>
        ))}
      </div>
      <Button size="sm" className="mt-2" onClick={() => setSteps([...steps, { day: (steps[steps.length - 1]?.day || 0) + 2, type: "email", subject: "", body: "" }])}>+ Add step</Button>
      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
      <div className="mt-4 flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button kind="primary" onClick={save}>Save sequence</Button></div>
    </Modal>
  );
}

function OutreachInner() {
  const { view, tick, refresh, canEdit, isHead, openCopilot } = useApp();
  const sp = useSearchParams();
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<"todo" | "all" | "templates">(sp.get("tab") === "switch" ? "all" : "todo");
  const [filter, setFilter] = useState<string>(sp.get("tab") === "switch" ? "switch_contact" : "");
  const [send, setSend] = useState<QStep | null>(null);
  const [reply, setReply] = useState<{ id: string; company: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [editSeq, setEditSeq] = useState<Seq | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  useEffect(() => { api<Data>(`/api/outreach${isHead && view ? `?owner=${encodeURIComponent(view)}` : ""}`).then(setD).catch(() => {}); }, [view, tick, isHead]);
  if (!d) return <div className="text-sm text-slate-500">Loading…</div>;
  const s = d.stats;
  const call = async (st: QStep, outcome: string) => { try { await api(`/api/outreach/steps/${encodeURIComponent(st.id)}`, { method: "PATCH", body: JSON.stringify({ action: outcome === "skip" ? "skip" : "done", outcome }) }); refresh(); } catch (e) { alert((e as Error).message); } };
  const stop = async (e: Enr) => { if (!confirm(`Stop the sequence for ${e.company}?`)) return; await api(`/api/outreach/enrollments/${encodeURIComponent(e.id)}`, { method: "POST", body: JSON.stringify({ action: "stop" }) }).catch((x) => alert(x.message)); refresh(); };
  const restart = async (e: Enr) => { await api(`/api/outreach/enrollments/${encodeURIComponent(e.id)}`, { method: "POST", body: JSON.stringify({ action: "restart" }) }).catch((x) => alert(x.message)); refresh(); };
  const list = d.enrollments.filter((e) => !filter || e.status === filter);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-xl font-semibold">Email sequences</h1>
          <p className="text-sm text-slate-500">After the first call: proposal email, then a follow-up every other day and a call twice a week. Any reply stops the sequence and comes to you to handle. No reply in 3 weeks: switch contact.</p></div>
        <div className="flex gap-2"><Button onClick={() => openCopilot("How are our email sequences doing? Reply rate, who needs a new contact, and which steps are overdue.")}>✦ Analyse</Button><Button kind="primary" onClick={() => setAdding(true)}>+ Start sequence</Button></div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Due today" value={s.due_today} sub="emails to send, calls to make" />
        <Stat label="Overdue" value={s.overdue} tone={s.overdue ? "bad" : "good"} />
        <Stat label="Running" value={s.active} sub={`${s.emails_sent} emails sent · ${s.sent_7d} this week`} />
        <Stat label="Reply rate" value={pct(s.total ? s.replied / s.total : 0)} sub={`${s.replied} replied · ${s.positive} interested`} />
        <Stat label="Need new contact" value={s.switch_contact} tone={s.switch_contact ? "warn" : "good"} sub="3 weeks, no reply" />
      </div>
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {([["todo", `To do today (${d.queue.length})`], ["all", `All sequences (${d.enrollments.length})`], ["templates", "Templates"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cx("-mb-px border-b-2 px-3 py-2 text-sm", tab === k ? "border-indigo-600 font-medium text-indigo-700 dark:text-indigo-300" : "border-transparent text-slate-500")}>{l}</button>
        ))}
      </div>

      {tab === "todo" && (d.queue.length === 0 ? <Empty>Nothing due. Every sequence step is up to date.</Empty> : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {d.queue.map((q) => {
            const late = q.due < d.today; const ed = canEdit(q.owner_id);
            return (
              <div key={q.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Badge tone={q.type === "email" ? "indigo" : "violet"}>{q.type === "email" ? "Email" : "Call"} · step {q.step_no}/{q.total_steps}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm"><span className="font-medium">{q.company}</span> · {q.subject}</div>
                  <div className="text-xs text-slate-500">{q.contact || "No contact"}{q.email ? ` · ${q.email}` : ""} · {q.owner_name} · <span className={late ? "font-medium text-rose-600" : ""}>{late ? `overdue since ${fdate(q.due)}` : "due today"}</span></div>
                </div>
                {ed && (q.type === "email"
                  ? <Button size="sm" kind="primary" onClick={() => setSend(q)}>Review & send</Button>
                  : <span className="flex gap-1"><Button size="sm" onClick={() => call(q, "connected")}>Connected</Button><Button size="sm" onClick={() => call(q, "no_answer")}>No answer</Button><Button size="sm" kind="ghost" onClick={() => call(q, "skip")}>Skip</Button></span>)}
                {ed && <Button size="sm" kind="ghost" onClick={() => setReply({ id: q.enrollment_id, company: q.company })}>They replied</Button>}
              </div>
            );
          })}
        </div>
      ))}

      {tab === "all" && (
        <>
          <div className="flex flex-wrap gap-1">
            {[["", "All"], ["active", "Running"], ["replied", "Replied"], ["switch_contact", "Need new contact"], ["stopped", "Stopped"]].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={cx("rounded-full px-3 py-1 text-xs", filter === k ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700")}>{l} ({k ? d.enrollments.filter((e) => e.status === k).length : d.enrollments.length})</button>
            ))}
          </div>
          {list.length === 0 ? <Empty>No sequences here.</Empty> : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500"><tr className="border-b border-slate-100 dark:border-slate-800"><th className="px-3 py-2">Company</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Progress</th><th className="px-3 py-2">Next step</th><th className="px-3 py-2">Owner</th><th className="px-3 py-2"></th></tr></thead>
                <tbody>{list.slice(0, 500).map((e) => {
                  const total = Number(e.total_steps), done = Number(e.done_steps), ed = canEdit(e.owner_id);
                  return [
                    <tr key={e.id} className="border-b border-slate-50 dark:border-slate-800/50">
                      <td className="px-3 py-2"><button onClick={() => setOpenRow(openRow === e.id ? null : e.id)} className="text-left font-medium hover:underline">{e.company}</button><div className="text-xs text-slate-500">{e.contact || "No contact"} · started {fdate(e.started_at)}</div></td>
                      <td className="px-3 py-2"><Badge tone={ST[e.status]?.tone || "slate"}>{ST[e.status]?.label || e.status}</Badge>{e.reply_outcome && <div className="mt-0.5 text-[11px] text-slate-500">{e.reply_outcome.replace("_", " ")}</div>}</td>
                      <td className="px-3 py-2"><div className="h-1.5 w-28 rounded bg-slate-100 dark:bg-slate-800"><div className="h-1.5 rounded bg-indigo-500" style={{ width: `${(done / Math.max(1, total)) * 100}%` }} /></div><div className="mt-0.5 text-[11px] text-slate-500">{done} of {total} steps · {e.emails_sent} emails</div></td>
                      <td className="px-3 py-2 text-xs">{e.status === "active" && e.next_due ? `${e.next_type === "call" ? "Call" : "Email"} on ${fdate(e.next_due)}` : e.stop_reason || ""}</td>
                      <td className="px-3 py-2 text-xs">{e.owner_name}</td>
                      <td className="px-3 py-2 text-right">{ed && <span className="flex justify-end gap-1">
                        {e.status === "active" && <><Button size="sm" onClick={() => setReply({ id: e.id, company: e.company })}>They replied</Button><Button size="sm" kind="ghost" onClick={() => stop(e)}>Stop</Button></>}
                        {(e.status === "switch_contact" || e.status === "stopped") && <Button size="sm" onClick={() => restart(e)} title="Use after switching to a new contact in Pipeline">Restart</Button>}
                      </span>}</td>
                    </tr>,
                    openRow === e.id ? <tr key={e.id + "x"}><td colSpan={6} className="bg-slate-50 dark:bg-slate-800/40"><StepsTimeline id={e.id} /></td></tr> : null,
                  ];
                })}</tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-slate-400">Need new contact: switch the contact on the company in Pipeline (that also stops this sequence), then press Restart.</p>
        </>
      )}

      {tab === "templates" && d.sequences.map((q) => (
        <Card key={q.id} title={<span>{q.name} {q.auto_start && <Badge tone="green">starts automatically when a proposal is mailed</Badge>}</span>} sub={q.description}
          right={isHead ? <Button size="sm" onClick={() => setEditSeq(q)}>Edit</Button> : null}>
          <ol className="space-y-1.5">{q.steps.map((st, i) => (
            <li key={i} className="flex gap-3 text-sm"><span className="w-14 shrink-0 text-xs text-slate-500">Day {st.day}</span><Badge tone={st.type === "email" ? "indigo" : "violet"}>{st.type === "email" ? "Email" : "Call"}</Badge><span className="truncate">{st.subject}</span></li>
          ))}<li className="flex gap-3 text-sm"><span className="w-14 shrink-0 text-xs text-slate-500">Day {q.switch_after_days}</span><Badge tone="amber">Check</Badge><span>No reply: switch contact</span></li></ol>
        </Card>
      ))}

      <SendModal step={send} onClose={() => setSend(null)} />
      <ReplyModal enr={reply} onClose={() => setReply(null)} />
      <AddModal open={adding} onClose={() => setAdding(false)} d={d} />
      <StepEditor seq={editSeq} onClose={() => setEditSeq(null)} />
    </div>
  );
}

export default function Outreach() { return <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}><OutreachInner /></Suspense>; }
