"use client";
import React, { useEffect, useRef, useState } from "react";
import { api } from "@/lib/fmt";
import { useApp } from "./shell";
import { Button, cx } from "./ui";

type Proposal = { type: "task" | "deal_stage" | "sequence" | "payment" | "task_update"; title: string; reason: string; payload: Record<string, unknown>; state?: "done" | "dismissed" | "error"; note?: string };
type Msg = { role: "user" | "assistant"; text: string; proposals?: Proposal[]; steps?: { tool: string; args: unknown; ok: boolean }[]; model?: string };
type Store = { msgs: Msg[]; history: unknown[] };

const MEMBER_STARTERS = [
  "What should I focus on this week to stay on pace?",
  "Which of my leads have gone silent for 3+ weeks? Create follow-up tasks for the top 3.",
  "How many of my companies are not connected yet, and which ones should I find new contacts for first?",
  "Who in the team is already talking to companies in the fintech sector?",
  "Summarise this week's meeting notes from the team.",
];
const STARTERS: Record<string, string[]> = {
  gef: [
    "Are we on track for the base and stretch targets? Show the numbers.",
    "Which strategy is underperforming and what should we change?",
    "How many deals will we sign by the fest? Give a range and how it compares with the plan.",
    "How much cash will we have before the fest, and what is it based on?",
    "Which leads have gone silent for 3+ weeks? Create follow-up tasks for the top 3.",
  ],
  campusfest: [
    "Compare the 6 campaigns: which ones produced confirmed partnerships, and at what rate?",
    "Did we hit the revised target of 28 confirmed partnerships?",
    "What was the cost per confirmed partnership for each campaign?",
    "As of 31 March 2025, how many partnerships were confirmed, and which channel was converting best?",
    "Where did warm channels beat cold outreach, in numbers?",
  ],
};

function md(text: string) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  const inline = (s: string, k: number) => s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith("**") ? <strong key={`${k}-${i}`}>{p.slice(2, -2)}</strong> : p.startsWith("`") ? <code key={`${k}-${i}`} className="rounded bg-slate-100 px-1 text-[12px] dark:bg-slate-800">{p.slice(1, -1)}</code> : p);
  const flush = () => { if (list.length) { out.push(<ul key={`ul${out.length}`} className="my-1 list-disc space-y-0.5 pl-5">{list}</ul>); list = []; } };
  lines.forEach((l, i) => {
    const m = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
    if (m) list.push(<li key={i}>{inline(m[1], i)}</li>);
    else { flush(); if (l.trim().startsWith("#")) out.push(<p key={i} className="mt-2 font-semibold">{inline(l.replace(/^#+\s*/, ""), i)}</p>); else if (l.trim()) out.push(<p key={i} className="my-1">{inline(l, i)}</p>); }
  });
  flush();
  return out;
}

export function CopilotPanel({ compact, seed, onClose, page }: { compact?: boolean; seed?: string; onClose?: () => void; page?: string }) {
  const { meta, me, refresh, isHead } = useApp();
  const ds = meta.ctx!.ds.id;
  const key = `gc-chat-${ds}-${me.id}`;
  const [store, setStore] = useState<Store>({ msgs: [], history: [] });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const seeded = useRef<string | undefined>(undefined);

  useEffect(() => { try { const s = sessionStorage.getItem(key); if (s) setStore(JSON.parse(s)); } catch {} }, [key]);
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(store)); } catch {} endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [store, key]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setInput("");
    setBusy(true);
    const before = store;
    setStore({ ...before, msgs: [...before.msgs, { role: "user", text }] });
    try {
      const r = await api<{ reply: string; proposals: Proposal[]; steps: Msg["steps"]; history?: unknown[]; model?: string }>("/api/chat", {
        method: "POST", body: JSON.stringify({ history: before.history, message: text, page }),
      });
      setStore({ msgs: [...before.msgs, { role: "user", text }, { role: "assistant", text: r.reply, proposals: r.proposals, steps: r.steps, model: r.model }], history: r.history || before.history });
    } catch (e) {
      setStore({ ...before, msgs: [...before.msgs, { role: "user", text }, { role: "assistant", text: `Error: ${(e as Error).message}` }] });
    } finally { setBusy(false); }
  };

  useEffect(() => { if (seed && seeded.current !== seed) { seeded.current = seed; send(seed); } }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (mi: number, pi: number, confirm: boolean) => {
    const msgs = store.msgs.slice();
    const p = { ...msgs[mi].proposals![pi] };
    if (!confirm) p.state = "dismissed";
    else {
      try {
        if (p.type === "task") await api("/api/tasks", { method: "POST", body: JSON.stringify(p.payload) });
        else if (p.type === "sequence") await api("/api/outreach/enroll", { method: "POST", body: JSON.stringify({ deal_ids: p.payload.deal_ids }) });
        else if (p.type === "payment") await api(`/api/payments/${encodeURIComponent(String(p.payload.payment_id))}`, { method: "PATCH", body: JSON.stringify({ status: p.payload.status }) });
        else if (p.type === "task_update") await api(`/api/tasks/${encodeURIComponent(String(p.payload.task_id))}`, { method: "PATCH", body: JSON.stringify(p.payload.change) });
        else await api(`/api/deals/${encodeURIComponent(String(p.payload.deal_id))}`, { method: "PATCH", body: JSON.stringify({ stage: p.payload.stage }) });
        p.state = "done"; refresh();
      } catch (e) { p.state = "error"; p.note = (e as Error).message; }
    }
    msgs[mi] = { ...msgs[mi], proposals: msgs[mi].proposals!.map((x, j) => (j === pi ? p : x)) };
    // tell the model what happened so follow-ups stay grounded
    const note = { role: "user", parts: [{ text: `[app note] User ${p.state === "done" ? "CONFIRMED and the app executed" : p.state === "dismissed" ? "dismissed" : "tried but it failed: " + p.note}: ${p.title}` }] };
    const ack = { role: "model", parts: [{ text: "Noted." }] };
    setStore({ msgs, history: [...store.history, note, ack] });
  };

  return (
    <div className={cx("flex h-full flex-col", !compact && "rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900")}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
        <div>
          <div className="text-sm font-semibold">✦ Growth Analyst & Copilot</div>
          <div className="text-[11px] text-slate-500">Answers from live {meta.ctx!.ds.simulated ? "simulated" : "original"} data · tasks only after you confirm</div>
        </div>
        <div className="flex gap-1">
          {store.msgs.length > 0 && <Button size="sm" kind="ghost" onClick={() => setStore({ msgs: [], history: [] })}>New chat</Button>}
          {onClose && <Button size="sm" kind="ghost" onClick={onClose}>✕</Button>}
        </div>
      </div>
      <div className="scroll-thin flex-1 space-y-3 overflow-y-auto p-4">
        {!meta.ai && <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">AI key not configured on the server (GEMINI_API_KEY). The rest of the app works.</div>}
        {store.msgs.length === 0 && (
          <div>
            <p className="mb-2 text-xs text-slate-500">Try one of these, then ask follow-ups:</p>
            <div className="space-y-1.5">
              {(isHead ? STARTERS[ds] || STARTERS.gef : MEMBER_STARTERS).map((s) => (
                <button key={s} onClick={() => send(s)} className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:hover:bg-indigo-950">{s}</button>
              ))}
            </div>
          </div>
        )}
        {store.msgs.map((m, i) => (
          <div key={i} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cx("max-w-[92%] rounded-xl px-3 py-2 text-sm", m.role === "user" ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-slate-800")}>
              {m.role === "assistant" ? md(m.text) : m.text}
              {m.steps && m.steps.length > 0 && (
                <details className="mt-1 text-[11px] text-slate-500">
                  <summary className="cursor-pointer">Checked {m.steps.length} data source{m.steps.length > 1 ? "s" : ""}: {Array.from(new Set(m.steps.map((s) => s.tool.replace("_", " ")))).join(", ")}</summary>
                  {m.steps.map((s, j) => <pre key={j} className="mt-1 whitespace-pre-wrap break-all rounded bg-white/60 p-1.5 text-[10px] dark:bg-slate-900/60">{s.tool}{s.ok ? "" : " (error)"} {JSON.stringify(s.args)}</pre>)}
                </details>
              )}
              {m.proposals?.map((p, j) => (
                <div key={j} className="mt-2 rounded-lg border border-indigo-200 bg-white p-2.5 text-slate-800 dark:border-indigo-800 dark:bg-slate-900 dark:text-slate-100">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">{p.type === "task" ? "Proposed task" : p.type === "sequence" ? "Proposed email sequence" : p.type === "payment" ? "Proposed payment update" : p.type === "task_update" ? "Proposed task change" : "Proposed deal change"}</div>
                  <div className="text-sm font-medium">{p.title}</div>
                  {p.type === "task" && <div className="text-xs text-slate-500">Owner {String(p.payload.owner_name)} · due {String(p.payload.due_date)} · {String(p.payload.priority)} priority</div>}
                  {p.payload.details ? <div className="mt-1 text-xs">{String(p.payload.details)}</div> : null}
                  {p.reason && <div className="mt-1 text-xs text-slate-500">Why: {p.reason}</div>}
                  <div className="mt-2 flex gap-2">
                    {!p.state && <><Button size="sm" kind="primary" onClick={() => act(i, j, true)}>Confirm</Button><Button size="sm" onClick={() => act(i, j, false)}>Dismiss</Button></>}
                    {p.state === "done" && <span className="text-xs font-medium text-emerald-600">✓ Done, saved to the app</span>}
                    {p.state === "dismissed" && <span className="text-xs text-slate-500">Dismissed</span>}
                    {p.state === "error" && <span className="text-xs text-rose-600">Failed: {p.note}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {busy && <div className="text-xs text-slate-500">Analysing live data…</div>}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-slate-100 p-3 dark:border-slate-800">
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about performance, bottlenecks, what to do next…"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950" />
          <Button kind="primary" type="submit" disabled={busy || !input.trim()}>Send</Button>
        </div>
      </form>
    </div>
  );
}
