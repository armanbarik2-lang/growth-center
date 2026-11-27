import { GoogleGenAI } from "@google/genai";
import { requireCtx, isResp, json, err } from "@/lib/api";
import { one } from "@/lib/db";
import { MODELS, thinkingFor, isModelMissing, isBusy, isSlowOrBusy, shortReason } from "@/lib/gemini";

export const maxDuration = 30;
const TIME_BUDGET_MS = 25_000;

/** Polishes one sequence email with Gemini. Nothing is saved until the user saves it. */
export async function POST(req: Request) {
  const ctx = await requireCtx(); if (isResp(ctx)) return ctx;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return err("AI is not configured on the server (GEMINI_API_KEY)", 503);
  const { subject, body, instruction, company } = await req.json();
  const ai = new GoogleGenAI({ apiKey: key });
  const fest = String(ctx.ds.name || "").replace(/\s*\(.*\)\s*$/, "").trim() || "our fest";
  const co = company ? await one<{ industry: string | null; sector_group: string | null }>(
    "select industry, sector_group from companies where ds=$1 and name=$2 limit 1", [ctx.ds.id, company]) : null;
  const known = co ? [co.industry && `industry: ${co.industry}`, co.sector_group && `sector group: ${co.sector_group}`].filter(Boolean).join("; ") : "";
  const prompt = `Rewrite this sponsorship follow-up email for a college entrepreneurship fest. Keep every fact and number exactly as given; do not invent offers, discounts, deadlines or numbers. Keep it short, warm and professional, Indian business English, no em dashes. Format it as a real email: greeting on its own line, a blank line between paragraphs, and the sign-off and name on their own lines at the end (use \\n line breaks in the JSON string). ${instruction ? "Extra instruction: " + instruction : ""}
Fest name: ${fest}. If you name the fest, use exactly this name; never invent another name for it.
Company: ${company || ""}${known ? ` (${known})` : ""}. Personalise only with these details and what the email already says. Do not guess what the company does from its name and do not describe its focus, values or products beyond these details.
Return only JSON: {"subject": "...", "body": "..."}

Subject: ${subject}
Body:
${body}`;
  const started = Date.now();
  const tried: string[] = [];
  for (const model of MODELS) {
    const ms = TIME_BUDGET_MS - (Date.now() - started);
    if (ms < 3_000) break;
    try {
      const r = await ai.models.generateContent({ model, contents: prompt, config: { responseMimeType: "application/json", temperature: 0.4, thinkingConfig: thinkingFor(model), abortSignal: AbortSignal.timeout(ms) } });
      const out = JSON.parse(r.text || "{}");
      if (out.subject && out.body) return json({ subject: String(out.subject), body: tidyBody(String(out.body).replace(/—/g, ",")), model });
    } catch (e) {
      const msg = (e as Error).message || (e as Error).name || "";
      const why = shortReason(model, msg);
      tried.push(why);
      console.error("[ai-draft]", why);
      if (isModelMissing(msg) || isBusy(msg)) continue;
      if (isSlowOrBusy(msg)) return err(`The AI service is busy or slow right now. Please try again. (${tried.join("; ")})`, 503);
      return err(`AI error: ${why}`, 502);
    }
  }
  return err(`AI could not draft this email${tried.length ? " (" + tried.join("; ") + ")" : ""}`, 502);
}

/** If the model returns the email as one paragraph, put the greeting and sign-off back on their own lines. */
function tidyBody(body: string): string {
  if (body.includes("\n")) return body.trim();
  return body
    .replace(/^((?:Hi|Hello|Dear)\s[^,]{1,40},)\s*/i, "$1\n\n")
    .replace(/\s*((?:Best regards|Warm regards|Kind regards|Regards|Best|Thanks|Thank you|Sincerely),)\s*(.+)$/i, "\n\n$1\n$2")
    .trim();
}
