import { GoogleGenAI } from "@google/genai";
import { requireCtx, isResp, json, err } from "@/lib/api";
import { MODELS, thinkingFor, isModelMissing, isSlowOrBusy } from "@/lib/gemini";

export const maxDuration = 30;
const TIME_BUDGET_MS = 25_000;

/** Polishes one sequence email with Gemini. Nothing is saved until the user saves it. */
export async function POST(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return err("AI is not configured on the server (GEMINI_API_KEY)", 503);
  const { subject, body, instruction, company } = await req.json();
  const ai = new GoogleGenAI({ apiKey: key });
  const prompt = `Rewrite this sponsorship follow-up email for a college entrepreneurship fest. Keep every fact and number exactly as given; do not invent offers, discounts, deadlines or numbers. Keep it short, warm and professional, Indian business English, no em dashes. ${instruction ? "Extra instruction: " + instruction : ""}
Company: ${company || ""}
Return only JSON: {"subject": "...", "body": "..."}

Subject: ${subject}
Body:
${body}`;
  const started = Date.now();
  for (const model of MODELS) {
    const ms = TIME_BUDGET_MS - (Date.now() - started);
    if (ms < 3_000) break;
    try {
      const r = await ai.models.generateContent({ model, contents: prompt, config: { responseMimeType: "application/json", temperature: 0.4, thinkingConfig: thinkingFor(model), abortSignal: AbortSignal.timeout(ms) } });
      const out = JSON.parse(r.text || "{}");
      if (out.subject && out.body) return json({ subject: String(out.subject), body: String(out.body).replace(/—/g, ","), model });
    } catch (e) {
      const msg = (e as Error).message || (e as Error).name || "";
      if (isSlowOrBusy(msg)) return err("The AI service is busy or slow right now. Please try again in a moment.", 503);
      if (!isModelMissing(msg)) return err(`AI error: ${msg.slice(0, 200)}`, 502);
    }
  }
  return err("AI could not draft this email", 502);
}
