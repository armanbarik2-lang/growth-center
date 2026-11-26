"use client";
import React, { useEffect, useState } from "react";
import { api, fdt } from "@/lib/fmt";
import { useApp } from "./shell";
import { Button, Field, inputCls, Modal, Badge, cx } from "./ui";

export type NoteRow = { id: string; kind: string; title: string; detail: string | null; brief: string | null; detail_hidden?: boolean; meeting_at: string | null;
  created_at: string; author_id: string; author_name: string; company_id: string | null; company_name: string | null; audience: string; read: boolean };

const KIND: Record<string, { label: string; tone: "violet" | "amber" | "slate" }> = {
  mom: { label: "Meeting notes", tone: "violet" }, remark: { label: "Remark", tone: "amber" }, update: { label: "Update", tone: "slate" },
};

/** Write meeting notes (MoM), an update, or a remark on a deal. Detailed version goes to chosen heads; a brief goes to all members. */
export function NoteComposer({ open, onClose, onDone, companyId, dealId, companyName, kind: k0 = "mom" }: {
  open: boolean; onClose: () => void; onDone?: () => void; companyId?: string | null; dealId?: string | null; companyName?: string | null; kind?: "mom" | "update" | "remark" }) {
  const { heads, me, refresh } = useApp();
  const [kind, setKind] = useState(k0);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [brief, setBrief] = useState("");
  const [when, setWhen] = useState("");
  const [toAll, setToAll] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [toMembers, setToMembers] = useState(true);
  const [company, setCompany] = useState<{ id: string; name: string } | null>(companyId ? { id: companyId, name: companyName || "" } : null);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; owner_name: string }[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setKind(k0); setTitle(companyName && k0 === "mom" ? `Meeting with ${companyName}` : ""); setDetail(""); setBrief(""); setErr("");
    setWhen(new Date(Date.now() + 19800000).toISOString().slice(0, 16)); setCompany(companyId ? { id: companyId, name: companyName || "" } : null); } }, [open, k0, companyId, companyName]);
  useEffect(() => { if (!search || companyId) { setFound([]); return; } const t = setTimeout(() => api<typeof found>(`/api/companies?q=${encodeURIComponent(search)}`).then(setFound).catch(() => {}), 250); return () => clearTimeout(t); }, [search, companyId]);
  const save = async () => {
    setErr("");
    try {
      await api("/api/notes", { method: "POST", body: JSON.stringify({
        kind, title, detail, brief: kind === "remark" ? detail : brief, company_id: company?.id || null, deal_id: dealId || null,
        meeting_at: kind === "mom" && when ? new Date(when + ":00+05:30").toISOString() : null,
        to_heads: kind === "remark" ? ["*"] : toAll ? ["*"] : picked, to_members: kind === "remark" ? false : toMembers,
      }) });
      refresh(); onDone?.(); onClose();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Modal open={open} onClose={onClose} title={kind === "remark" ? "Add a remark" : kind === "mom" ? "Record meeting notes" : "Share an update"} wide>
      <div className="space-y-3">
        <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5 text-xs dark:border-slate-700">
          {(["mom", "update", "remark"] as const).map((x) => (
            <button key={x} onClick={() => setKind(x)} disabled={x === "remark" && !dealId && !company} className={cx("flex-1 rounded-md px-2 py-1.5 disabled:opacity-40", kind === x && "bg-indigo-600 text-white")}>
              {x === "mom" ? "Meeting notes (MoM)" : x === "update" ? "General update" : "Remark on this deal"}
            </button>
          ))}
        </div>
        {!companyId && !dealId && (
          <Field label="Company (optional)" hint="Links the note to the company so it shows on its card (👁).">
            {company ? <div className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-700">{company.name}<button className="text-xs text-slate-500" onClick={() => setCompany(null)}>change</button></div> : (
              <div className="relative"><input className={inputCls} placeholder="Search a company" value={search} onChange={(e) => setSearch(e.target.value)} />
                {found.length > 0 && <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow dark:border-slate-700 dark:bg-slate-900">
                  {found.map((c) => <button key={c.id} onClick={() => { setCompany(c); setSearch(""); }} className="block w-full px-2.5 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800">{c.name} <span className="text-xs text-slate-500">· {c.owner_name}</span></button>)}
                </div>}</div>)}
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <Field label="Title"><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "remark" ? "e.g. 4 guests need accommodation" : "e.g. Meeting with Brand Head"} /></Field>
          {kind === "mom" && <Field label="Meeting date and time"><input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} /></Field>}
        </div>
        <Field label={kind === "remark" ? "Remark (visible to everyone working on this deal)" : "Detailed notes (for heads)"}>
          <textarea rows={kind === "remark" ? 3 : 5} className={inputCls} value={detail} onChange={(e) => setDetail(e.target.value)}
            placeholder={kind === "remark" ? "e.g. 4 people from their team attend on 30-31 Jan: book 2 guest-house rooms and airport pickup." : "Who attended, what they want, budget, objections, decision date, next steps"} />
        </Field>
        {kind !== "remark" && (
          <div className="grid gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">Send detailed notes to</div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={toAll} onChange={(e) => setToAll(e.target.checked)} className="accent-indigo-600" />All heads</label>
              {!toAll && heads.filter((h) => h.id !== me.id).map((h) => (
                <label key={h.id} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-indigo-600" checked={picked.includes(h.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, h.id] : picked.filter((x) => x !== h.id))} />{h.name}<span className="text-xs text-slate-500">{h.title?.replace(/^Head \d: /, "")}</span></label>
              ))}
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={toMembers} onChange={(e) => setToMembers(e.target.checked)} className="accent-indigo-600" />Share a brief with all members</label>
              {toMembers && <textarea rows={2} className={cx(inputCls, "mt-1")} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="One line, e.g. Met X: interested in Strategic, decision by 5 Dec" />}
            </div>
          </div>
        )}
        <p className="text-xs text-slate-500">{kind === "remark" ? "Shows on the deal card, in Payments & deliverables, and behind the 👁 icon in Pipeline." : "Everyone you send it to gets a live alert. Meeting notes linked to a company are also logged as a meeting held."}</p>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button>
          <Button kind="primary" onClick={save} disabled={!title.trim() || (kind !== "remark" && !toAll && !picked.length && !toMembers) || (kind === "remark" && !detail.trim())}>Send</Button></div>
      </div>
    </Modal>
  );
}

export function NoteCard({ n, onDelete }: { n: NoteRow; onDelete?: () => void }) {
  const { me, isHead } = useApp();
  const k = KIND[n.kind] || KIND.update;
  return (
    <div className={cx("rounded-xl border bg-white p-3 dark:bg-slate-900", !n.read && n.kind !== "remark" ? "border-violet-300 dark:border-violet-800" : "border-slate-200 dark:border-slate-800")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={k.tone}>{k.label}</Badge>
        {!n.read && n.kind !== "remark" && <Badge tone="violet">new</Badge>}
        <span className="text-sm font-medium">{n.title}</span>
        {(isHead || n.author_id === me.id) && onDelete && <button onClick={onDelete} className="ml-auto text-xs text-slate-400 hover:text-rose-600">delete</button>}
      </div>
      <div className="mt-0.5 text-xs text-slate-500">{n.author_name} · {fdt(n.meeting_at || n.created_at)}{n.company_name ? ` · ${n.company_name}` : ""}{n.kind !== "remark" ? ` · to ${n.audience}` : ""}</div>
      {n.detail ? <p className="mt-2 whitespace-pre-wrap text-sm">{n.detail}</p> : null}
      {!n.detail && n.brief ? <p className="mt-2 text-sm">{n.brief}</p> : null}
      {n.detail_hidden && <p className="mt-1 text-[11px] text-slate-400">Detailed notes went to the chosen heads; you see the brief.</p>}
    </div>
  );
}

/** Small eye button that shows a company's remarks and notes. */
export function NotesEye({ companyId, count }: { companyId: string; count: number }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NoteRow[] | null>(null);
  if (!count) return null;
  const show = (e: React.MouseEvent) => { e.stopPropagation(); setOpen(true); if (!rows) api<NoteRow[]>(`/api/notes?company=${encodeURIComponent(companyId)}`).then(setRows).catch(() => setRows([])); };
  return (
    <>
      <span role="button" tabIndex={0} title={`${count} note${count > 1 ? "s" : ""}`} onClick={show}
        className="inline-flex items-center gap-0.5 rounded px-1 text-[11px] text-violet-600 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950">👁 {count}</span>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 p-4 pt-24" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>
          <div className="w-full max-w-lg space-y-2 rounded-xl bg-slate-50 p-3 shadow-xl dark:bg-slate-950" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-1 text-sm font-semibold">Notes and remarks<button onClick={() => setOpen(false)} className="text-slate-400">✕</button></div>
            {!rows ? <div className="p-2 text-sm text-slate-500">Loading…</div> : rows.map((n) => <NoteCard key={n.id} n={n} />)}
          </div>
        </div>
      )}
    </>
  );
}
