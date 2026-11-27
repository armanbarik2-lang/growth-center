import { ThinkingLevel, type ThinkingConfig } from "@google/genai";

/**
 * Model order: env override first, then current Flash and Flash-Lite models.
 * Free-tier quotas are per model, so each extra model is extra headroom. Gemini 2.5 models are retired for new keys.
 */
export const MODELS = Array.from(new Set([process.env.GEMINI_MODEL, ...(process.env.GEMINI_FALLBACKS || "").split(","),
  "gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
  .map((m) => (m || "").trim()).filter(Boolean)));

/* Per server instance: models that do not exist for this key, and models resting after a 429. */
const missing = new Set<string>();
const restUntil = new Map<string, number>();

/** Remember what an error says about a model, so the next request skips it. */
export function noteFailure(model: string, msg: string) {
  if (isModelMissing(msg)) { missing.add(model); return; }
  if (isTimeout(msg)) { restUntil.set(model, Date.now() + 45_000); return; }
  if (isBusy(msg)) {
    if (isDailyQuota(msg)) { restUntil.set(model, Date.now() + 60 * 60_000); return; }
    const m = msg.match(/retry(?:Delay)?["']?\s*(?:in|:)?\s*["']?(\d+(?:\.\d+)?)\s*s/i);
    const secs = Math.min(300, Math.max(15, m ? Number(m[1]) : 60));
    restUntil.set(model, Date.now() + secs * 1000);
  }
}

/** Models to try now, best first: skips missing ones and those resting; if all are resting, the one that frees up first. */
export function usableModels(prefer?: string): string[] {
  const now = Date.now();
  const live = MODELS.filter((m) => !missing.has(m));
  const ready = live.filter((m) => (restUntil.get(m) || 0) <= now);
  const list = ready.length ? ready : live.slice().sort((a, b) => (restUntil.get(a) || 0) - (restUntil.get(b) || 0)).slice(0, 1);
  if (prefer && list.includes(prefer)) return [prefer, ...list.filter((m) => m !== prefer)];
  return list.length ? list : MODELS.slice(0, 1);
}

/**
 * Keep thinking short so a multi-step answer fits inside Vercel's function time limit.
 * Gemini 3.x takes a thinking level; Gemini 2.5 takes a token budget.
 */
export function thinkingFor(model: string): ThinkingConfig | undefined {
  if (/^gemini-3/.test(model)) return { thinkingLevel: ThinkingLevel.LOW };
  if (/^gemini-2\.5-flash-lite/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 512 };
  return undefined;
}

/** True when an error means "this model name is not available here", so the next model should be tried. */
export function isModelMissing(msg: string): boolean {
  return /not found|404|not supported|unknown model|invalid model|is not available/i.test(msg);
}

/** True when the error says the model's free daily quota is used up. */
export function isDailyQuota(msg: string): boolean {
  return /per ?day|PerDay|RPD|daily/i.test(msg);
}

/** True when a call was cut off by our own time limit. */
export function isTimeout(msg: string): boolean {
  return /abort|timed? ?out|deadline/i.test(msg);
}

/** True when the model refused for load or quota reasons; another model (own quota) may still answer. */
export function isBusy(msg: string): boolean {
  return /429|resource.?exhausted|quota|rate.?limit|overloaded|503|unavailable|500|internal/i.test(msg);
}

/** True when a call failed only because it ran out of its time slice or was rate limited. */
export function isSlowOrBusy(msg: string): boolean {
  return isTimeout(msg) || isBusy(msg);
}

/** Short, key-free reason for showing to the user and in the server log. */
export function shortReason(model: string, msg: string): string {
  const clean = msg.replace(/key=[^&\s"]+/gi, "key=***").replace(/\s+/g, " ").trim();
  const code = clean.match(/\b(4\d\d|5\d\d)\b/)?.[1];
  const tag = isTimeout(clean) ? "timed out" : code === "429" ? (isDailyQuota(clean) ? "daily free quota used up" : /PerMinute|per ?minute/i.test(clean) ? "per-minute limit" : "quota or rate limit (HTTP 429)") : code ? `HTTP ${code}` : "error";
  return `${model}: ${tag}${clean ? " - " + clean.slice(0, 120) : ""}`;
}
