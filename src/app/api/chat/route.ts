import type { Content } from "@google/genai";
import { chat } from "@/lib/copilot";
import { requireCtx, isResp, json, err } from "@/lib/api";

export const maxDuration = 60;

/**
 * Earlier turns keep only their question and answer text: tool calls and tool results are dropped
 * (the model re-checks live data every turn), which keeps follow-ups fast and under rate limits.
 */
function slim(history: Content[]): Content[] {
  const out: Content[] = [];
  for (const c of history) {
    const parts = (c.parts || []).filter((p) => typeof p.text === "string" && !p.thought && p.text.trim() && !p.text.startsWith("Time is nearly up")).map((p) => ({ text: p.text as string }));
    if (!parts.length) continue;
    const last = out[out.length - 1];
    if (last && last.role === c.role) last.parts = [...(last.parts || []), ...parts];
    else out.push({ role: c.role, parts });
  }
  return out;
}

function trim(history: Content[]): Content[] {
  let h = slim(Array.isArray(history) ? history : []);
  // keep the conversation under ~250 KB by dropping the oldest complete turns
  while (JSON.stringify(h).length > 250000 && h.length > 2) {
    h = h.slice(1);
    while (h.length && !(h[0].role === "user" && h[0].parts?.some((p) => typeof p.text === "string"))) h = h.slice(1);
  }
  return h;
}

export async function POST(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const { history = [], message, page } = await req.json();
  if (!message || typeof message !== "string") return err("Empty message");
  const contents: Content[] = trim([...(Array.isArray(history) ? history : []), { role: "user", parts: [{ text: message }] }]);
  try {
    const out = await chat(ctx, contents, page);
    return json({ ...out, history: slim((out as { history?: Content[] }).history || contents) });
  } catch (e) {
    const msg = (e as Error).message || "AI error";
    return json({ reply: `The AI service returned an error: ${msg.slice(0, 300)}`, proposals: [], steps: [], history: contents.slice(0, -1) });
  }
}
