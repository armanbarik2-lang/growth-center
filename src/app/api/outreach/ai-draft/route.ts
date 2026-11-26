import { GoogleGenAI } from "@google/genai";
import { requireCtx, isResp, json, err } from "@/lib/api";

export const maxDuration = 30;
const MODELS = [process.env.GEMINI_MODEL, "gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite"].filter(Boolean) as string[];

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
  for (const model of MODELS) {
    try {
      const r = await ai.models.generateContent({ model, contents: prompt, config: { responseMimeType: "application/json", temperature: 0.4 } });
      const out = JSON.parse(r.text || "{}");
      if (out.subject && out.body) return json({ subject: String(out.subject), body: String(out.body).replace(/—/g, ","), model });
    } catch (e) {
      if (!/not found|404|not supported|unknown model/i.test((e as Error).message)) return err(`AI error: ${(e as Error).message.slice(0, 200)}`, 502);
    }
  }
  return err("AI could not draft this email", 502);
}
