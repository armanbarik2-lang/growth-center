"use client";
import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Optional guided tour. Never starts on its own: first-time visitors see a small,
 * non-blocking invite they can accept or dismiss, and the tour can be reopened
 * any time from the "Tour" button in the header. Esc or "Skip" ends it at once.
 */
export type TourStep = {
  path?: string;                 // page to open for this step
  target?: string[];             // tried in order: "[data-tour=..]" selectors or "text:Exact heading"
  title: string;
  body: React.ReactNode;
  action?: { label: string; run: () => void };
};

const KEY = "gc-tour";
const read = () => { try { return localStorage.getItem(KEY); } catch { return "done"; } };
const write = (v: string) => { try { localStorage.setItem(KEY, v); } catch { /* storage blocked: ignore */ } };

function visible(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const r = (el as HTMLElement).getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
function find(target: string): HTMLElement | null {
  if (target.startsWith("text:")) {
    const want = target.slice(5);
    const all = Array.from(document.querySelectorAll("main h2, main div, main span"));
    const hit = all.find((e) => e.children.length === 0 && e.textContent?.trim() === want && visible(e));
    if (!hit) return null;
    const box = hit.closest("section, .rounded-2xl") || hit;
    return visible(box) ? (box as HTMLElement) : null;
  }
  return Array.from(document.querySelectorAll(target)).find(visible) as HTMLElement | undefined ?? null;
}

export const startTour = () => window.dispatchEvent(new Event("gc-tour-start"));

type Rect = { top: number; left: number; width: number; height: number };

export function Tour({ steps }: { steps: TourStep[] }) {
  const [step, setStep] = useState<number | null>(null);
  const [invite, setInvite] = useState(false);
  useEffect(() => { if (!read()) setInvite(true); }, []);
  const start = useCallback(() => { setInvite(false); write("seen"); setStep(0); }, []);
  const dismiss = useCallback(() => { setInvite(false); write("dismissed"); }, []);
  const end = useCallback(() => { setStep(null); write("done"); }, []);
  useEffect(() => {
    window.addEventListener("gc-tour-start", start);
    return () => window.removeEventListener("gc-tour-start", start);
  }, [start]);
  const router = useRouter();
  const path = usePathname();
  const [rect, setRect] = useState<Rect | null>(null);
  const [vw, setVw] = useState(1200);
  const s = step === null ? null : steps[step];

  // open the step's page, then wait (up to ~2 s) for its target to render
  useEffect(() => {
    if (!s) return;
    if (s.path && s.path !== path) { setRect(null); router.push(s.path); return; }
    let tries = 0, alive = true;
    const locate = () => {
      if (!alive) return;
      const el = (s.target || []).map(find).find(Boolean) || null;
      if (el) {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        setTimeout(() => { if (!alive) return; const r = el.getBoundingClientRect(); setRect({ top: r.top, left: r.left, width: r.width, height: r.height }); }, 250);
      } else if (s.target && tries++ < 20) setTimeout(locate, 100);
      else setRect(null);
    };
    locate();
    return () => { alive = false; };
  }, [s, path, router]);

  useLayoutEffect(() => {
    const onSize = () => setVw(window.innerWidth);
    onSize(); window.addEventListener("resize", onSize);
    return () => window.removeEventListener("resize", onSize);
  }, []);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") end();
      else if (e.key === "ArrowRight") setStep((i) => (i === null ? i : Math.min(i + 1, steps.length - 1)));
      else if (e.key === "ArrowLeft") setStep((i) => (i === null ? i : Math.max(i - 1, 0)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, end, setStep, steps.length]);

  if (invite && step === null) return (
    <div className="gc-fade fixed bottom-5 left-5 z-[60] w-72 rounded-xl border border-indigo-200 bg-white p-3.5 shadow-xl dark:border-indigo-800 dark:bg-slate-900">
      <div className="text-sm font-semibold">New here?</div>
      <div className="mt-0.5 text-xs text-slate-500">A 1-minute guided tour of the plan and the product. You can skip it at any time.</div>
      <div className="mt-2.5 flex items-center gap-3">
        <button onClick={start} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">Take the tour</button>
        <button onClick={dismiss} className="text-xs text-slate-500 hover:underline">No thanks</button>
      </div>
    </div>
  );
  if (!s || step === null) return null;

  const pad = 6, W = Math.min(340, vw - 24);
  let card: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: W };
  if (rect) {
    const right = rect.left + rect.width + 14, below = rect.top + rect.height + 14;
    if (right + W < vw - 12 && rect.width < vw / 2) card = { left: right, top: Math.max(12, Math.min(rect.top, window.innerHeight - 260)), width: W };
    else if (below + 220 < window.innerHeight) card = { left: Math.max(12, Math.min(rect.left, vw - W - 12)), top: below, width: W };
    else card = { left: Math.max(12, Math.min(rect.left, vw - W - 12)), top: Math.max(12, rect.top - 234), width: W };
  }
  const last = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-label="Guided tour">
      {rect
        ? <div className="pointer-events-none fixed rounded-xl ring-2 ring-indigo-500 transition-all duration-200" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px rgba(15,23,42,0.45)" }} />
        : <div className="fixed inset-0 bg-slate-900/45" onClick={end} />}
      <div className="gc-fade fixed rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900" style={card}>
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
          <span>Tour · {step + 1} of {steps.length}</span>
          <button onClick={end} className="font-normal normal-case tracking-normal text-slate-500 hover:underline">Skip tour</button>
        </div>
        <div className="mt-1.5 text-sm font-semibold">{s.title}</div>
        <div className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">{s.body}</div>
        <div className="mt-3 flex items-center gap-2">
          {step > 0 && <button onClick={() => setStep(step - 1)} className="rounded-lg px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Back</button>}
          <div className="ml-auto flex items-center gap-2">
            {s.action && <button onClick={() => { end(); s.action!.run(); }} className="rounded-lg border border-indigo-200 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950">{s.action.label}</button>}
            <button onClick={() => (last ? end() : setStep(step + 1))} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">{last ? "Finish" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
