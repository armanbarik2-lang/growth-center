import { ThinkingLevel, type ThinkingConfig } from "@google/genai";

/** Model order: env override first, then fast general models. */
export const MODELS = [process.env.GEMINI_MODEL, "gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite"].filter(Boolean) as string[];

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

/** True when a call failed only because it ran out of its time slice or was rate limited. */
export function isSlowOrBusy(msg: string): boolean {
  return /abort|timed? ?out|deadline|429|resource.?exhausted|overloaded|503|unavailable/i.test(msg);
}
