"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, inr, fdate, fdt } from "@/lib/fmt";
import { useApp } from "@/components/shell";
import { Button, Drawer, Field, inputCls, Badge, Modal, cx, Empty } from "@/components/ui";
import { NotesEye, NoteCard, NoteComposer, NoteRow } from "@/components/notes";

type Deal = { id: string; name: string; stage: string; proposed_value: string | null; confirmed_value: string | null; support_type: string; package: string | null;
  owner_id: string; owner_name: string; campaign_id: string; campaign_name: string; company_id: string; company_name: string; sector_group: string | null;
  contact_name: string | null; contact_title: string | null; last_activity: string | null; stage_changed_at: string; note_count: number };
type Company = { company: Record<string, string>; contacts: Record<string, string>[]; deals: Record<string, string>[];
  activities: Record<string, string>[]; history: Record<string, string | null>[];
  sequences?: { id: string; status: string; deal_id: string; stop_reason: string | null; reply_outcome: string | null; name: string; total: string; done: string; next_due: string | null }[] };
type Camp = { id: string; name: string };

const HINT: Record<string, string> = {
  prospect: "Companies still to call",
  call_attempted: "Tried calling, could not connect: find a new contact or number",
  called: "Spoke to someone; get the right email and send the proposal",
  follow_up: "Proposal sent; follow up every other day by email, twice a week by call",
  good_lead: "Showed interest",
  contact_switched: "No reply in 3 weeks; moved to another contact",
};

function DealDrawer({ deal, onClose, onSaved }: { deal: Deal; onClose: () => void; onSaved: () => void }) {
  const { stages, canEdit, members, isHead, openCopilot, meta, tick } = useApp();
  const [c, setC] = useState<Company | null>(null);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [stage, setStage] = useState(deal.stage);
  const [val, setVal] = useState(deal.proposed_value === null ? "" : String(Number(deal.proposed_value) || ""));
  const [owner, setOwner] = useState(deal.owner_id);
  const [log, setLog] = useState({ type: "call", outcome: "connected", summary: "" });
  const [sw, setSw] = useState({ name: "", title: "" });
  const [task, setTask] = useState({ title: "", due_date: "" });
  const [compose, setCompose] = useState<null | "mom" | "remark">(null);
  const [msg, setMsg] = useState("");
  const editable = canEdit(deal.owner_id);
  const load = () => {
    api<Company>(`/api/companies/${encodeURIComponent(deal.company_id)}`).then(setC).catch(() => {});
    api<NoteRow[]>(`/api/notes?company=${encodeURIComponent(deal.company_id)}`).then(setNotes).catch(() => {});
  };
  useEffect(() => { load(); }, [deal.company_id, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); setMsg(ok); load(); onSaved(); } catch (e) { setMsg((e as Error).message); } };
  const saveDeal = () => run(() => api(`/api/deals/${encodeURIComponent(deal.id)}`, { method: "PATCH", body: JSON.stringify({ stage, proposed_value: Number(val) || 0, owner_id: owner }) }), "Saved. Every number in the app is updated.");
  const logIt = () => run(() => api("/api/activities", { method: "POST", body: JSON.stringify({ company_id: deal.company_id, campaign_id: deal.campaign_id, channel: log.type.includes("call") ? "call" : log.type.includes("meeting") ? "meeting" : "email", ...log }) }), log.type === "call" ? "Call logged; the stage moves to Connected or Not connected automatically." : "Activity logged.");
  const switchIt = () => run(() => api("/api/activities", { method: "POST", body: JSON.stringify({ company_id: deal.company_id, campaign_id: deal.campaign_id, type: "contact_switched", outcome: "switched", summary: `Switched to ${sw.name}`, new_contact_name: sw.name, new_contact_title: sw.title }) }), "Contact switched.");
  const startSeq = () => run(() => api("/api/outreach/enroll", { method: "POST", body: JSON.stringify({ deal_ids: [deal.id] }) }).then((r) => { const x = r as { enrolled: number; failed: string[] }; if (!x.enrolled) throw new Error(x.failed[0] || "Could not start"); }), "Follow-up sequence started. Steps appear in Email sequences.");
  const seq = c?.sequences?.[0];
  const SEQL: Record<string, string> = { active: "Running", replied: "Stopped: they replied", switch_contact: "No reply in 3 weeks: switch contact", stopped: "Stopped", completed: "Finished" };
  const addTask = () => run(() => api("/api/tasks", { method: "POST", body: JSON.stringify({ title: task.title, due_date: task.due_date || null, deal_id: deal.id, campaign_id: deal.campaign_id, company_id: deal.company_id, owner_id: deal.owner_id }) }), "Task added.");
  const days = deal.last_activity ? Math.floor((new Date(meta.ctx!.today).getTime() - new Date(deal.last_activity).getTime()) / 86400000) : null;
  const silent = days !== null && days >= 21 && !["prospect", "prospecting", "called", "call_attempted"].includes(deal.stage) && stages.find((s) => s.key === deal.stage)?.kind === "open";
  const remarks = notes.filter((n) => n.kind === "remark"), others = notes.filter((n) => n.kind !== "remark");
  return (
    <Drawer open onClose={onClose} title={deal.company_name}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge tone="indigo">{stages.find((s) => s.key === deal.stage)?.label}</Badge><Badge>{deal.campaign_name}</Badge>
          {deal.package && <Badge tone="violet">{deal.package}</Badge>}{deal.support_type !== "cash" && <Badge tone="amber">in-kind</Badge>}
          {silent && <Badge tone="red">silent {days} days: switch contact</Badge>}
          {deal.stage === "call_attempted" && <Badge tone="amber">not connected: find a new contact</Badge>}
        </div>
        <div className="text-xs text-slate-500">Owner {deal.owner_name} · {c?.company.sector_group || c?.company.industry} · contact {deal.contact_name || "none"}{deal.contact_title ? ` (${deal.contact_title})` : ""}</div>
        {!editable && <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500 dark:bg-slate-800">View only: {deal.owner_name} handles this company. Coordinate with them before reaching out.</div>}
        {msg && <div className="rounded-lg bg-indigo-50 p-2 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{msg}</div>}

        {remarks.length > 0 && <section className="space-y-2"><div className="text-xs font-semibold text-amber-700 dark:text-amber-400">REMARKS</div>{remarks.map((n) => <NoteCard key={n.id} n={n} />)}</section>}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" kind="primary" onClick={() => setCompose("mom")}>+ Meeting notes</Button>
          {editable && <Button size="sm" onClick={() => setCompose("remark")}>+ Remark</Button>}
          <Button size="sm" onClick={() => openCopilot(`Look at the deal "${deal.name}" (id ${deal.id}). What is its status, history and the best next step?`)}>✦ Next step?</Button>
        </div>

        {(seq || (editable && ["called", "proposal_mailed", "follow_up", "contacted", "proposal_sent"].includes(deal.stage))) && <section className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500"><span>EMAIL SEQUENCE</span>{seq && <a href="/outreach?tab=all" className="font-normal text-indigo-600">open</a>}</div>
          {seq ? <div className="text-xs">
            <span className="font-medium">{SEQL[seq.status] || seq.status}</span>{seq.reply_outcome ? ` (${seq.reply_outcome.replace("_", " ")})` : ""} · {seq.done} of {seq.total} steps done{seq.status === "active" && seq.next_due ? ` · next on ${fdate(seq.next_due)}` : ""}
          </div> : <div className="text-xs text-slate-500">No sequence yet. It sends the proposal and the follow-ups on the GES cadence and stops by itself when they reply.</div>}
          {editable && (!seq || !["active", "replied"].includes(seq.status)) && ["called", "proposal_mailed", "follow_up", "contacted", "proposal_sent"].includes(deal.stage) &&
            <Button size="sm" className="mt-2" onClick={startSeq}>Start follow-up sequence</Button>}
        </section>}

        {editable && <section className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className="mb-2 text-xs font-semibold text-slate-500">DEAL</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Stage"><select className={inputCls} value={stage} onChange={(e) => setStage(e.target.value)}>{stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
            <Field label="Value (₹)"><input type="number" min={0} step={1000} className={inputCls} value={val} onChange={(e) => setVal(e.target.value)} /></Field>
            {isHead && <Field label="Owner"><select className={inputCls} value={owner} onChange={(e) => setOwner(e.target.value)}>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>}
          </div>
          <Button kind="primary" size="sm" className="mt-2" onClick={saveDeal}>Save</Button>
        </section>}

        {editable && <section className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className="mb-2 text-xs font-semibold text-slate-500">LOG A CALL, EMAIL OR MEETING</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Type"><select className={inputCls} value={log.type} onChange={(e) => setLog({ ...log, type: e.target.value })}>
              {["call", "follow_up_call", "follow_up_email", "proposal_mailed", "reply", "meeting_held", "note"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></Field>
            <Field label="Outcome"><select className={inputCls} value={log.outcome} onChange={(e) => setLog({ ...log, outcome: e.target.value })}>
              {["connected", "no_answer", "sent", "positive", "neutral", "not_interested", "attended"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></Field>
          </div>
          <div className="mt-2"><Field label="Note"><input className={inputCls} value={log.summary} onChange={(e) => setLog({ ...log, summary: e.target.value })} /></Field></div>
          <Button size="sm" className="mt-2" onClick={logIt}>Log</Button>
          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <div className="mb-1 text-xs font-semibold text-slate-500">NEW CONTACT (not connected, or silent 3 weeks)</div>
            <div className="grid grid-cols-2 gap-2"><input placeholder="Name" className={inputCls} value={sw.name} onChange={(e) => setSw({ ...sw, name: e.target.value })} /><input placeholder="Title" className={inputCls} value={sw.title} onChange={(e) => setSw({ ...sw, title: e.target.value })} /></div>
            <Button size="sm" className="mt-2" disabled={!sw.name} onClick={switchIt}>Switch contact</Button>
          </div>
          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <div className="mb-1 text-xs font-semibold text-slate-500">ADD TASK</div>
            <div className="grid grid-cols-[1fr_140px] gap-2"><input placeholder="e.g. Send revised proposal" className={inputCls} value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} /><input type="date" className={inputCls} value={task.due_date} onChange={(e) => setTask({ ...task, due_date: e.target.value })} /></div>
            <Button size="sm" className="mt-2" disabled={!task.title} onClick={addTask}>Add task</Button>
          </div>
        </section>}

        {others.length > 0 && <section className="space-y-2"><div className="text-xs font-semibold text-slate-500">MEETING NOTES AND UPDATES</div>{others.map((n) => <NoteCard key={n.id} n={n} />)}</section>}
        <section>
          <div className="mb-1 text-xs font-semibold text-slate-500">CONTACTS</div>
          {c?.contacts.map((p) => <div key={p.id} className="text-xs">{p.name} · {p.title} {String(p.active) === "false" && <Badge>old</Badge>}</div>)}
        </section>
        <section>
          <div className="mb-1 text-xs font-semibold text-slate-500">STAGE HISTORY</div>
          <ul className="space-y-0.5 text-xs">{c?.history.map((h) => <li key={String(h.id)}>{fdt(h.effective_at)} · {stages.find((s) => s.key === h.stage)?.label || h.stage}{h.proposed_value !== null ? ` · ${inr(Number(h.proposed_value))}` : ""}{h.changed_by_name ? ` · by ${h.changed_by_name}` : ""}</li>)}</ul>
        </section>
        <section>
          <div className="mb-1 text-xs font-semibold text-slate-500">ACTIVITY</div>
          <ul className="space-y-1 text-xs">{c?.activities.map((a) => <li key={a.id} className="border-l-2 border-slate-200 pl-2 dark:border-slate-700"><span className="text-slate-500">{fdt(a.occurred_at)}</span> · <span className="font-medium">{a.type.replace(/_/g, " ")}</span>{a.outcome ? ` (${a.outcome.replace(/_/g, " ")})` : ""}{a.summary ? ` · ${a.summary}` : ""} <span className="text-slate-400">{a.owner_name || ""}</span></li>)}</ul>
        </section>
      </div>
      <NoteComposer open={!!compose} kind={compose || "mom"} onClose={() => setCompose(null)} onDone={load} companyId={deal.company_id} dealId={deal.id} companyName={deal.company_name} />
    </Drawer>
  );
}

function AddDeal({ open, onClose, onDone, camps }: { open: boolean; onClose: () => void; onDone: () => void; camps: Camp[] }) {
  const { members, me, isHead } = useApp();
  const [f, setF] = useState<Record<string, string>>({ company_name: "", campaign_id: "", contact_name: "", contact_title: "", proposed_value: "", owner_id: me.id, package: "" });
  const [err, setErr] = useState("");
  const save = async () => { try { await api("/api/deals", { method: "POST", body: JSON.stringify(f) }); onDone(); } catch (e) { setErr((e as Error).message); } };
  const fld = (k: string, l: string, t = "text") => <Field label={l}><input type={t} className={inputCls} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>;
  return (
    <Modal open={open} onClose={onClose} title="Add a company">
      <div className="grid gap-3 sm:grid-cols-2">
        {fld("company_name", "Company")}
        <Field label="Strategy"><select className={inputCls} value={f.campaign_id} onChange={(e) => setF({ ...f, campaign_id: e.target.value })}><option value="">None</option>{camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        {fld("contact_name", "Contact name")}{fld("contact_title", "Contact title")}{fld("proposed_value", "Package value (₹)", "number")}{fld("package", "Package (e.g. Corporate)")}
        {isHead && <Field label="Owner"><select className={inputCls} value={f.owner_id} onChange={(e) => setF({ ...f, owner_id: e.target.value })}>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>}
      </div>
      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
      <div className="mt-4 flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button kind="primary" onClick={save} disabled={!f.company_name.trim()}>Add</Button></div>
    </Modal>
  );
}

function PipelineInner() {
  const { view, tick, refresh, stages, meta, members, me, isHead } = useApp();
  const sp = useSearchParams(); const router = useRouter();
  const [camps, setCamps] = useState<Camp[]>([]);
  const [campaign, setCampaign] = useState(sp.get("campaign") || "");
  const [owner, setOwner] = useState(sp.get("owner") ?? (isHead ? "" : me.id));
  const [sector, setSector] = useState("");
  const [stageF, setStageF] = useState(sp.get("stage") || "");
  const [qtext, setQtext] = useState("");
  const [mode, setMode] = useState<"board" | "table">(sp.get("stage") ? "table" : "board");
  const [data, setData] = useState<{ rows: Deal[]; counts: { stage: string; n: number }[]; sectors: string[] } | null>(null);
  const [open, setOpen] = useState<Deal | null>(null);
  const [adding, setAdding] = useState(false);
  const dealParam = sp.get("deal");
  const who = isHead && view ? view : owner;
  useEffect(() => { api<Camp[]>("/api/campaigns").then(setCamps).catch(() => {}); }, [tick]);
  useEffect(() => {
    const p = new URLSearchParams({ limit: "2000" });
    if (campaign) p.set("campaign", campaign); if (who) p.set("owner", who); if (qtext) p.set("q", qtext); if (sector) p.set("sector", sector); if (stageF) p.set("stage", stageF);
    api<NonNullable<typeof data>>(`/api/deals?${p}`).then((d) => { setData(d); if (dealParam) { const f = d.rows.find((r) => r.id === dealParam); if (f) setOpen(f); } }).catch(() => {});
  }, [campaign, who, qtext, sector, stageF, tick, dealParam]);
  const cnt = new Map((data?.counts || []).map((c) => [c.stage, c.n]));
  const today = new Date(meta.ctx!.today).getTime();
  const silent = (d: Deal) => !!d.last_activity && (today - new Date(d.last_activity).getTime()) / 86400000 >= 21 && stages.find((s) => s.key === d.stage)?.kind === "open" && !["prospect", "prospecting", "called", "call_attempted"].includes(d.stage);
  const sel = inputCls.replace("w-full ", "");
  const EARLY = ["prospect", "call_attempted", "called", "proposal_mailed", "follow_up", "contact_switched"];
  const value = (d: Deal) => { if (EARLY.includes(d.stage)) return null; const v = d.confirmed_value && Number(d.confirmed_value) ? d.confirmed_value : d.proposed_value; return v === null ? null : inr(Number(v)); };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-xl font-semibold">Pipeline</h1><p className="text-sm text-slate-500">Every company by stage. 👁 = has notes or remarks. Click a company to update it, log a call or meeting, or switch contact.</p></div>
        <Button kind="primary" onClick={() => setAdding(true)}>+ Add company</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input placeholder="Search company" className={sel + " w-44"} value={qtext} onChange={(e) => setQtext(e.target.value)} />
        {!isHead && <select className={sel + " w-44"} value={owner} onChange={(e) => setOwner(e.target.value)}><option value={me.id}>My companies</option><option value="">Everyone</option>{members.filter((m) => m.id !== me.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
        <select className={sel + " w-52"} value={sector} onChange={(e) => setSector(e.target.value)}><option value="">All sectors</option>{(data?.sectors || []).map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select className={sel + " w-52"} value={campaign} onChange={(e) => setCampaign(e.target.value)}><option value="">All strategies</option>{camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className={sel + " w-48"} value={stageF} onChange={(e) => setStageF(e.target.value)}><option value="">All stages</option>{stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">{(["board", "table"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={cx("rounded-md px-2 py-1 text-xs", mode === m && "bg-slate-100 font-medium dark:bg-slate-800")}>{m === "board" ? "Board" : "List"}</button>)}</div>
      </div>
      {!data ? <div className="text-sm text-slate-500">Loading…</div> : data.rows.length === 0 ? <Empty>No companies match.</Empty> : mode === "board" ? (
        <div className="scroll-thin flex gap-3 overflow-x-auto pb-2">
          {stages.filter((s) => !stageF || s.key === stageF).map((s) => {
            const items = data.rows.filter((r) => r.stage === s.key);
            const warn = s.key === "call_attempted" || s.key === "contact_switched";
            return (
              <div key={s.key} className={cx("w-64 shrink-0 rounded-xl p-2", warn ? "bg-amber-50 dark:bg-amber-950/30" : s.kind === "won" || s.kind === "post" ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-slate-100/70 dark:bg-slate-900")}>
                <div className="mb-0.5 flex items-center justify-between px-1 text-xs"><span className={cx("font-semibold", warn && "text-amber-800 dark:text-amber-300", (s.kind === "won" || s.kind === "post") && "text-emerald-700 dark:text-emerald-400", s.kind === "exit" && !warn && "text-slate-400")}>{s.label}</span><span className="num text-slate-500">{cnt.get(s.key) || 0}</span></div>
                {HINT[s.key] && <div className="mb-2 px-1 text-[10px] leading-tight text-slate-500">{HINT[s.key]}</div>}
                <div className="scroll-thin max-h-[62vh] space-y-1.5 overflow-y-auto">
                  {items.slice(0, 40).map((d) => (
                    <div key={d.id} role="button" tabIndex={0} onClick={() => setOpen(d)} className="block w-full cursor-pointer rounded-lg border border-slate-200 bg-white p-2 text-left text-xs hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-800">
                      <div className="flex items-center justify-between gap-1"><span className="truncate font-medium">{d.company_name}</span><NotesEye companyId={d.company_id} count={d.note_count} /></div>
                      <div className="truncate text-slate-500">{d.owner_name} · {d.campaign_name}</div>
                      <div className="mt-0.5 flex items-center justify-between"><span className="num text-slate-600 dark:text-slate-300">{value(d) ?? ""}</span>{silent(d) && <Badge tone="red">silent 3w+</Badge>}</div>
                    </div>
                  ))}
                  {items.length > 40 && <button onClick={() => { setStageF(s.key); setMode("table"); }} className="px-1 text-[11px] text-indigo-600 hover:underline">+{items.length - 40} more: open as list</button>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr className="border-b border-slate-100 dark:border-slate-800"><th className="px-3 py-2">Company</th><th className="px-3 py-2">Stage</th><th className="px-3 py-2">Sector group</th><th className="px-3 py-2">Owner</th><th className="px-3 py-2 text-right">Value</th><th className="px-3 py-2">Last activity</th></tr></thead>
            <tbody>{data.rows.slice(0, 500).map((d) => (
              <tr key={d.id} onClick={() => setOpen(d)} className="cursor-pointer border-b border-slate-50 hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-800/40">
                <td className="px-3 py-1.5 font-medium">{d.company_name} <NotesEye companyId={d.company_id} count={d.note_count} /></td><td className="px-3 py-1.5">{stages.find((s) => s.key === d.stage)?.label}</td><td className="px-3 py-1.5 text-xs">{d.sector_group}</td>
                <td className="px-3 py-1.5 text-xs">{d.owner_name}</td><td className="num px-3 py-1.5 text-right">{value(d) ?? <span className="text-slate-300">·</span>}</td><td className="px-3 py-1.5 text-xs">{fdate(d.last_activity)} {silent(d) && <Badge tone="red">silent</Badge>}</td></tr>))}
            </tbody>
          </table>
          {data.rows.length > 500 && <div className="p-2 text-xs text-slate-500">Showing 500 of {data.rows.length}. Filter or search to narrow.</div>}
        </div>
      )}
      {open && <DealDrawer key={open.id} deal={open} onClose={() => { setOpen(null); if (dealParam) router.replace("/pipeline"); }} onSaved={refresh} />}
      <AddDeal open={adding} onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); }} camps={camps} />
    </div>
  );
}

export default function Pipeline() { return <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}><PipelineInner /></Suspense>; }
