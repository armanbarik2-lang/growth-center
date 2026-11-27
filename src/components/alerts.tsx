"use client";
import { useRouter } from "next/navigation";
import { cx } from "./ui";

export type AlertItem = { kind: string; group?: string; title?: string; badge?: string; text: string; sub: string; ref: { type: string; id: string } };

const GROUPS = [
  { key: "strategy", label: "Strategy lines crossed", dot: "bg-amber-500", pill: "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  { key: "overdue", label: "Overdue", dot: "bg-rose-500", pill: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300" },
  { key: "due", label: "Due soon", dot: "bg-indigo-500", pill: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300" },
  { key: "silent", label: "Silent leads (3-week rule)", dot: "bg-amber-500", pill: "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300" },
  { key: "note", label: "Team notes", dot: "bg-violet-500", pill: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" },
  { key: "team", label: "Team", dot: "bg-slate-400", pill: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
];

export function alertHref(r: { type: string; id: string }) {
  return r.type === "task" ? "/tasks" : r.type === "payment" ? "/payments" : r.type === "campaign" ? `/strategies?id=${encodeURIComponent(r.id)}`
    : r.type === "deal" ? `/pipeline?deal=${encodeURIComponent(r.id)}` : r.type === "note" ? "/updates" : r.type === "stage" ? `/pipeline?stage=${r.id}`
    : r.type === "outreach" ? `/outreach${r.id ? "?tab=" + r.id : ""}` : "/tasks";
}

function groupOf(a: AlertItem) {
  if (a.group) return a.group;
  if (a.kind === "team") return "team";
  return a.kind === "overdue" ? "overdue" : a.kind === "silent" ? "silent" : a.kind === "note" ? "note" : "due";
}

/** Alerts grouped by type, each row: name, one line of detail and a pill on the right. */
export function AlertList({ items, perGroup = 4, onOpen, empty = "All clear." }: { items: AlertItem[]; perGroup?: number; onOpen?: (a: AlertItem) => void; empty?: string }) {
  const router = useRouter();
  const open = onOpen || ((a: AlertItem) => router.push(alertHref(a.ref)));
  if (!items.length) return <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500 dark:border-slate-700">{empty}</div>;
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => {
        const rows = items.filter((a) => groupOf(a) === g.key);
        if (!rows.length) return null;
        return (
          <div key={g.key}>
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.label}</span>
              <span className="num rounded-full bg-slate-100 px-1.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{rows.length}</span>
            </div>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {rows.slice(0, perGroup).map((a, i) => (
                <li key={i}>
                  <button onClick={() => open(a)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <span className={cx("h-2 w-2 shrink-0 rounded-full", g.dot)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{a.title || a.text}</span>
                      <span className="block truncate text-[11px] text-slate-500">{a.sub}</span>
                    </span>
                    {a.badge && <span className={cx("num shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", g.pill)}>{a.badge}</span>}
                  </button>
                </li>
              ))}
              {rows.length > perGroup && (
                <li><button onClick={() => open(rows[perGroup])} className="w-full px-3 py-1.5 text-left text-[11px] font-medium text-indigo-600 hover:bg-slate-50 dark:text-indigo-400 dark:hover:bg-slate-800/60">+{rows.length - perGroup} more</button></li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
