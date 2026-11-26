"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/fmt";
import { useApp } from "@/components/shell";
import { Button, Empty, cx } from "@/components/ui";
import { NoteCard, NoteComposer, NoteRow } from "@/components/notes";

export default function Updates() {
  const { tick, refresh, me } = useApp();
  const [rows, setRows] = useState<NoteRow[] | null>(null);
  const [filter, setFilter] = useState<"all" | "mom" | "update" | "remark" | "mine">("all");
  const [compose, setCompose] = useState<null | "mom" | "update">(null);
  useEffect(() => {
    api<NoteRow[]>("/api/notes").then((r) => {
      setRows(r);
      const unread = r.filter((n) => !n.read).map((n) => n.id);
      if (unread.length) api("/api/notes/read", { method: "POST", body: JSON.stringify({ ids: unread }) }).catch(() => {});
    }).catch(() => setRows([]));
  }, [tick]);
  const del = async (id: string) => { if (!confirm("Delete this note?")) return; await api(`/api/notes?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch((e) => alert(e.message)); refresh(); };
  const list = (rows || []).filter((n) => filter === "all" || (filter === "mine" ? n.author_id === me.id : n.kind === filter));
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-xl font-semibold">Meeting notes & updates</h1>
          <p className="text-sm text-slate-500">After a meeting, record the points. Heads get the detailed notes you choose; all members get a one-line brief. Everyone is alerted live.</p></div>
        <div className="flex gap-2"><Button onClick={() => setCompose("update")}>Share update</Button><Button kind="primary" onClick={() => setCompose("mom")}>+ Meeting notes</Button></div>
      </div>
      <div className="flex flex-wrap gap-1">
        {([["all", "All"], ["mom", "Meeting notes"], ["update", "Updates"], ["remark", "Deal remarks"], ["mine", "Mine"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={cx("rounded-full px-3 py-1 text-xs", filter === k ? "bg-indigo-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700")}>{l}</button>
        ))}
      </div>
      {!rows ? <div className="text-sm text-slate-500">Loading…</div> : list.length === 0 ? <Empty>Nothing here yet.</Empty> : (
        <div className="space-y-2">{list.map((n) => <NoteCard key={n.id} n={n} onDelete={() => del(n.id)} />)}</div>
      )}
      <NoteComposer open={!!compose} kind={compose || "mom"} onClose={() => setCompose(null)} />
    </div>
  );
}
