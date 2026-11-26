import type { Content } from "@google/genai";
import { chat } from "@/lib/copilot";
import { requireCtx, isResp, json, err } from "@/lib/api";

export const maxDuration = 60;

function trim(history: Content[]): Content[] {
  let h = history.slice();
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
  const contents: Content[] = [...trim(history), { role: "user", parts: [{ text: message }] }];
  try {
    const out = await chat(ctx, contents, page);
    return json(out);
  } catch (e) {
    const msg = (e as Error).message || "AI error";
    return json({ reply: `The AI service returned an error: ${msg.slice(0, 300)}`, proposals: [], steps: [], history: contents.slice(0, -1) });
  }
}
