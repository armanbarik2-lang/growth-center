import { GoogleGenAI, Content, FunctionDeclaration, FunctionCallingConfigMode, Part, Type, Schema } from "@google/genai";
import { pool, q, one } from "./db";
import { Ctx } from "./session";
import { dashboard, campaignMetrics, notificationsFor } from "./metrics";
import { myWork } from "./mywork";
import { MODELS, thinkingFor, isModelMissing, isBusy, isSlowOrBusy, shortReason } from "./gemini";

/** The chat route may run 60 s on Vercel; finish well before that. */
const TIME_BUDGET_MS = 50_000;
/** Below this much time left, stop calling tools and ask for the final answer. */
const FINAL_ROUND_MS = 16_000;
const MAX_ROUNDS = 6;

export type Proposal = {
  type: "task" | "deal_stage" | "sequence";
  title: string;
  payload: Record<string, unknown>;
  reason: string;
};

const SCHEMA = `Read-only SQL views (PostgreSQL). Every view already shows only the current dataset.
- dataset(id,name,simulated,as_of,outreach_start,fest_start,fest_end,stages jsonb,won_stage,stage_prob jsonb)
- members(id,name,role head|member,sector_group,title)
- campaigns(id,name,kind campaign|bet|base,channel,objective,audience,owner_id,start_at,end_at,budget,spent,rank,pact jsonb{p,a,c,t},target_deals,target_value,test,kpi,rule jsonb,pays_after_fest)
- companies(id,name,industry,sector_group,owner_id,campaign_id,qualification,qualification_reason,qualification_at,created_at)
- qualification_history(id,company_id,campaign_id,status,reason,effective_at)
- contacts(id,company_id,name,title,email,active,created_at)
- activities(id,company_id,contact_id,campaign_id,owner_id,channel,type,outcome,summary,attempt_id,qty,occurred_at)
  types: outreach_sent, delivered, replied, meeting_booked, meeting_held, introduction_received, web_inbound, opt_out (CampusFest);
  call, proposal_mailed, follow_up_email, follow_up_call, reply, meeting_held, negotiation, signed, contact_switched, email_burst (qty = emails sent), bounced (qty), stage_change (GEF)
- deals(id,name,company_id,contact_id,campaign_id,owner_id,support_type cash|in_kind,stage,furthest_idx,proposed_value,confirmed_value,package,created_at,updated_at,stage_changed_at)
- deal_history(id,deal_id,stage,proposed_value,confirmed_value,owner_id,changed_by,effective_at)  (every stage/value change, dated)
- payments(id,deal_id,kind advance|balance|full,amount,due_date,paid_at,status due|paid|written_off,note)
- deliverables(id,deal_id,item,status pending|done,due_date,done_at)
- tasks(id,title,details,owner_id,campaign_id,deal_id,company_id,due_date,status todo|doing|done,priority,source manual|ai,created_by,created_at,done_at)
- targets(id,version,effective_at,qualified_goal,deals_goal,signed_value_goal,before_fest_goal,note)
- activations(id,deal_id,company_id,attendee_campaign,note,linked_at)
- sequences(id,name,steps jsonb,auto_start,switch_after_days)  (email follow-up cadences)
- enrollments(id,sequence_id,deal_id,company_id,contact_id,owner_id,status active|replied|switch_contact|stopped|completed,started_at,stopped_at,stop_reason,reply_outcome)
- outreach_steps(id,enrollment_id,step_no,day,type email|call,due_date,status pending|sent|done|skipped,subject,outcome,done_at)
- notes(id,kind mom|remark|update,company_id,deal_id,author_id,title,detail,brief,meeting_at,to_heads,to_members,created_at)  (meeting notes and special remarks such as guests needing accommodation)
Money is INR. A deal is signed when its stage is the dataset's won stage or a later 'post' stage. furthest_idx = index in dataset.stages of the furthest stage ever reached.`;


type JS = { type: string; properties?: Record<string, JS>; required?: string[]; description?: string; enum?: string[] };
const TYPE: Record<string, Type> = { object: Type.OBJECT, string: Type.STRING, number: Type.NUMBER, integer: Type.INTEGER, boolean: Type.BOOLEAN, array: Type.ARRAY };
function S(j: JS): Schema {
  const out: Schema = { type: TYPE[j.type] };
  if (j.description) out.description = j.description;
  if (j.enum) out.enum = j.enum;
  if (j.properties) out.properties = Object.fromEntries(Object.entries(j.properties).map(([k, v]) => [k, S(v)]));
  if (j.required) out.required = j.required;
  if (j.type === "array") out.items = { type: Type.STRING };
  return out;
}

const TOOLS: FunctionDeclaration[] = [
  { name: "get_overview", description: "For heads: live team dashboard (KPIs, targets vs pace, funnel, weekly trend, every strategy with metrics and scale/change/stop status, alerts). For members: their own goals vs pace, their alerts, sector owners and recent team meetings. Call this first for most questions.",
    parameters: S( { type: "object", properties: { owner_id: { type: "string", description: "Optional member id to restrict to one owner" } } }) },
  { name: "get_campaign", description: "Heads only. Full metrics and rule status for one strategy (campaign), plus its deals by stage and its tasks.",
    parameters: S( { type: "object", properties: { campaign_id: { type: "string" } }, required: ["campaign_id"] }) },
  { name: "run_sql", description: "Run ONE read-only SELECT on the views described in the system prompt, for questions the other tools do not answer (counts, lists, comparisons, dates, calculations). Max 200 rows returned.",
    parameters: S( { type: "object", properties: { sql: { type: "string" }, purpose: { type: "string" } }, required: ["sql"] }) },
  { name: "propose_task", description: "Propose a task for the management tool. It is NOT created until the user clicks Confirm. Use after a recommendation the user may want to act on.",
    parameters: S( { type: "object", properties: {
      title: { type: "string" }, details: { type: "string" }, owner_id: { type: "string", description: "member id" },
      due_date: { type: "string", description: "YYYY-MM-DD" }, campaign_id: { type: "string" }, deal_id: { type: "string" },
      priority: { type: "string", enum: ["high", "normal", "low"] }, reason: { type: "string", description: "the evidence behind this task" } },
      required: ["title", "owner_id", "due_date", "reason"] }) },
  { name: "propose_sequence", description: "Propose starting the email follow-up sequence for one or more deals (ids). NOT started until the user confirms.",
    parameters: S({ type: "object", properties: { deal_ids: { type: "array" } as JS, reason: { type: "string" } }, required: ["deal_ids", "reason"] }) },
  { name: "propose_deal_stage", description: "Propose moving a deal to another stage. NOT applied until the user confirms.",
    parameters: S( { type: "object", properties: { deal_id: { type: "string" }, stage: { type: "string" }, reason: { type: "string" } }, required: ["deal_id", "stage", "reason"] }) },
];

function systemPrompt(ctx: Ctx, page: string | undefined) {
  const today = ctx.today.toISOString().slice(0, 10);
  return `You are the Growth Analyst & Copilot inside "Growth Center", the sponsorship command center for a college fest team.
Dataset: ${ctx.ds.name} (id ${ctx.ds.id}; ${ctx.ds.simulated ? "SIMULATED plan data, fictional companies" : "the ORIGINAL provided dataset"}).
Today for this dataset: ${today} (outreach week ${ctx.week}). Fest starts ${ctx.ds.fest_start}. ${ctx.ds.as_of ? "This dataset is a closed snapshot; 'today' is the snapshot end." : ""}
User: ${ctx.me.name} (id ${ctx.me.id}, role ${ctx.me.role}${ctx.me.sector_group ? ", sector group " + ctx.me.sector_group : ""}). ${page ? "They are looking at: " + page + "." : ""}
Vocabulary: a "strategy" (stored as a campaign) is one of the 5 ranked bets from the plan, the base sector outreach, or mass email.
Stages (in order): ${ctx.ds.stages.map((s) => `${s.key} (${s.kind})`).join(", ")}.
${ctx.me.role === "head" ? "" : ""}Stage win probabilities used for projections: ${JSON.stringify(ctx.ds.stage_prob)}. Source: ${ctx.ds.prob_source}

RULES
1. Answer ONLY from tool results on the live data. Never use general knowledge for numbers. Call tools before answering any question about performance, even if you answered something similar earlier (data may have changed).
2. Show the key numbers and how you computed them (e.g. "9 of 50 = 18%"). Use INR with L for lakh (₹1.5L). Double-check arithmetic; for sums and ratios over many rows prefer run_sql.
3. Separate EVIDENCE (measured in the data) from ASSUMPTIONS (stage probabilities, plan targets, the scale/change/stop rules). Label assumptions.
4. If the data cannot answer (e.g. no budget or payment records, no field for it), say so plainly, say what is missing, and suggest what to record. Never invent.
5. When diagnosing: compare against targets, pace, other campaigns and the rule lines; name the bottleneck stage; give the likely driver only if the data supports it.
6. Recommendations: say scale / change / stop with the reason, and offer to turn it into a task. To act, call propose_task or propose_deal_stage. Never claim a task is created: the user must click Confirm.
7. ${ctx.me.role === "member" ? "This user is a MEMBER. They must focus on their own goals. Never reveal team cash, team totals, budgets, targets or strategy status, even if asked; say these are visible to heads only. You may share coordination info: who owns which company or sector, stages, meetings and notes. Only propose tasks owned by them (" + ctx.me.id + ") or deal changes on their own deals." : "This user is a head: full access; you may propose tasks for any member."}
8. Be concise: short answer first, then 2 to 5 bullets of evidence. No em dashes.

${SCHEMA}`;
}

async function runSql(ctx: Ctx, sql: string) {
  const s = sql.trim().replace(/;\s*$/, "");
  if (!/^(select|with)\b/i.test(s) || s.includes(";")) return { error: "Only a single SELECT statement is allowed." };
  if (/\b(public|pg_catalog|information_schema|pg_)\w*\./i.test(s) || /\b(insert|update|delete|drop|alter|create|grant|truncate|copy|set|call|do)\b/i.test(s.replace(/'[^']*'/g, "")))
    return { error: "Only read-only queries on the listed views are allowed." };
  const c = await pool().connect();
  try {
    await c.query("begin read only");
    await c.query("select set_config('app.ds', $1, true), set_config('app.member', $2, true), set_config('search_path', 'ai', true), set_config('statement_timeout', '4000', true)",
      [ctx.ds.id, ctx.me.role === "head" ? "" : ctx.me.id]);
    const r = await c.query(s);
    await c.query("rollback");
    return { row_count: r.rowCount, rows: r.rows.slice(0, 200), truncated: (r.rowCount || 0) > 200 };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    return { error: (e as Error).message };
  } finally {
    c.release();
  }
}

function slimCampaign(c: Awaited<ReturnType<typeof campaignMetrics>>[number]) {
  return {
    id: c.id, name: c.name, kind: c.kind, owner: c.owner_name, rank: c.rank, pact_score: c.pact_score, pact: c.pact,
    budget: c.budget, spent: c.spent, test: c.test, kpi: c.kpi, target_deals: c.target_deals, target_value: c.target_value,
    pays_after_fest: c.pays_after_fest, listed: c.listed, contacted: c.contacted, attempts: c.attempts, responded: c.responded,
    meetings_held: c.meetings, good_leads_reached: c.good_leads, meetings_reached: c.meetings_reached, sanction_reached: c.sanction_reached,
    email_sends: c.sends, email_replies: c.replies, bounces: c.bounces, deals_open: c.deals_open, signed: c.signed,
    signed_value: c.signed_value, signed_cash: c.signed_cash, lost: c.lost, open_pipeline_value: c.pipeline_value,
    weighted_pipeline: Math.round(c.weighted_value), win_rate: c.win_rate, response_rate: c.response_rate, cost_per_signed: c.cost_per_signed,
    first_n_test: c.contacted_first_n ? { contacted: c.contacted_first_n, good_leads: c.good_leads_first_n, meetings: c.meetings_first_n } : undefined,
    status: c.status,
  };
}

export async function callTool(ctx: Ctx, name: string, args: Record<string, unknown>, proposals: Proposal[]) {
  if (name === "get_overview") {
    if (ctx.me.role !== "head") return { role: "member", note: "Team cash, targets and strategy status are visible to heads only.", ...(await myWork(ctx.ds, ctx.me.id)) };
    const d = await dashboard(ctx.ds, (args.owner_id as string) || null);
    const members = await q("select id, name, role, sector_group from members where ds=$1", [ctx.ds.id]);
    return { ...d, campaigns: d.campaigns.map(slimCampaign), members, weekly: d.weekly.slice(-8) };
  }
  if (name === "get_campaign") {
    if (ctx.me.role !== "head") return { error: "Strategy performance is visible to heads only." };
    const all = await campaignMetrics(ctx.ds);
    const c = all.find((x) => x.id === args.campaign_id || x.name.toLowerCase() === String(args.campaign_id).toLowerCase());
    if (!c) return { error: "No such campaign", available: all.map((x) => ({ id: x.id, name: x.name })) };
    const stages = await q("select stage, count(*)::int n, coalesce(sum(proposed_value),0) value from deals where ds=$1 and campaign_id=$2 group by stage", [ctx.ds.id, c.id]);
    const tasks = await q("select id, title, status, due_date::text due, owner_id from tasks where ds=$1 and campaign_id=$2 and status<>'done' limit 30", [ctx.ds.id, c.id]);
    return { ...slimCampaign(c), deals_by_stage: stages, open_tasks: tasks };
  }
  if (name === "run_sql") return runSql(ctx, String(args.sql || ""));
  if (name === "propose_task") {
    const owner = await one<{ id: string; name: string }>("select id, name from members where ds=$1 and id=$2", [ctx.ds.id, args.owner_id]);
    if (!owner) return { error: "Unknown owner_id. Use a member id from get_overview.members." };
    if (ctx.me.role === "member" && owner.id !== ctx.me.id) return { error: "Members can only create tasks for themselves." };
    const p: Proposal = { type: "task", title: String(args.title), reason: String(args.reason || ""), payload: {
      title: args.title, details: args.details || null, owner_id: owner.id, owner_name: owner.name, due_date: args.due_date,
      campaign_id: args.campaign_id || null, deal_id: args.deal_id || null, priority: args.priority || "normal", source: "ai" } };
    proposals.push(p);
    return { status: "proposed, waiting for the user to confirm in the chat panel", proposal_number: proposals.length };
  }
  if (name === "propose_sequence") {
    const ids = (Array.isArray(args.deal_ids) ? args.deal_ids : []).map(String).slice(0, 50);
    const rows = await q<{ id: string; owner_id: string }>("select id, owner_id from deals where ds=$1 and id = any($2::text[])", [ctx.ds.id, ids]);
    const ok = rows.filter((r) => ctx.me.role === "head" || r.owner_id === ctx.me.id).map((r) => r.id);
    if (!ok.length) return { error: "No valid deals you are allowed to enroll." };
    proposals.push({ type: "sequence", title: `Start the follow-up sequence for ${ok.length} compan${ok.length > 1 ? "ies" : "y"}`, reason: String(args.reason || ""), payload: { deal_ids: ok } });
    return { status: "proposed, waiting for the user to confirm", proposal_number: proposals.length };
  }
  if (name === "propose_deal_stage") {
    const d = await one<{ id: string; name: string; owner_id: string; stage: string }>("select id, name, owner_id, stage from deals where ds=$1 and id=$2", [ctx.ds.id, args.deal_id]);
    if (!d) return { error: "Unknown deal_id" };
    if (!ctx.ds.stages.some((s) => s.key === args.stage)) return { error: "Unknown stage" };
    if (ctx.me.role === "member" && d.owner_id !== ctx.me.id) return { error: "Members can only change their own deals." };
    proposals.push({ type: "deal_stage", title: `Move "${d.name}" from ${d.stage} to ${args.stage}`, reason: String(args.reason || ""), payload: { deal_id: d.id, stage: args.stage } });
    return { status: "proposed, waiting for the user to confirm", proposal_number: proposals.length };
  }
  return { error: "Unknown tool" };
}

export async function chat(ctx: Ctx, history: Content[], page?: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { reply: "The AI copilot is not configured: GEMINI_API_KEY is missing on the server.", proposals: [], steps: [] };
  const ai = new GoogleGenAI({ apiKey: key });
  const contents: Content[] = [...history];
  const proposals: Proposal[] = [];
  const steps: { tool: string; args: unknown; ok: boolean }[] = [];
  const started = Date.now();
  const left = () => TIME_BUDGET_MS - (Date.now() - started);
  const tried: string[] = [];
  let model = MODELS[0];
  for (let i = 0; i < MAX_ROUNDS; i++) {
    // Last round (by count or by clock): no more tool calls, answer from what is already gathered.
    const finalRound = i === MAX_ROUNDS - 1 || left() < FINAL_ROUND_MS;
    if (finalRound && steps.length) {
      const nudge = { text: "Time is nearly up. Do not call more tools. Answer now from the data already gathered, show the numbers you used, and say what is still unknown." };
      const last = contents[contents.length - 1];
      if (last?.role === "user") last.parts = [...(last.parts || []), nudge];
      else contents.push({ role: "user", parts: [nudge] });
    }
    let res;
    for (let m = MODELS.indexOf(model); m < MODELS.length; m++) {
      const ms = Math.max(5_000, left() - 2_000);
      try {
        res = await ai.models.generateContent({
          model: MODELS[m], contents,
          config: {
            systemInstruction: systemPrompt(ctx, page),
            tools: [{ functionDeclarations: TOOLS }],
            toolConfig: finalRound ? { functionCallingConfig: { mode: FunctionCallingConfigMode.NONE } } : undefined,
            temperature: 0.2,
            thinkingConfig: thinkingFor(MODELS[m]),
            abortSignal: AbortSignal.timeout(ms),
          },
        });
        model = MODELS[m];
        break;
      } catch (e) {
        const msg = (e as Error).message || (e as Error).name || "";
        const why = shortReason(MODELS[m], msg);
        tried.push(why);
        console.error("[copilot]", why);
        // Model missing, or busy / over quota with time left: try the next model (each has its own quota).
        if (m < MODELS.length - 1 && (isModelMissing(msg) || (isBusy(msg) && left() > 12_000))) continue;
        if (isSlowOrBusy(msg)) {
          return { reply: (steps.length
            ? "The AI service could not finish this answer in time. The data steps it ran are listed below; please ask again or narrow the question."
            : "The AI service is busy or slow right now. Please try again in a moment.") + `\n\n(Details: ${tried.join("; ")})`, proposals, steps, model, history: contents };
        }
        throw new Error(why);
      }
    }
    if (!res) throw new Error("No model response");
    const content = res.candidates?.[0]?.content;
    const calls = res.functionCalls || [];
    if (!content) break;
    contents.push(content);
    if (!calls.length) {
      return { reply: res.text || "", proposals, steps, model, history: contents };
    }
    const parts: Part[] = [];
    for (const fc of calls) {
      let out: unknown;
      try { out = await callTool(ctx, fc.name || "", (fc.args || {}) as Record<string, unknown>, proposals); }
      catch (e) { out = { error: (e as Error).message }; }
      steps.push({ tool: fc.name || "", args: fc.args, ok: !(out as { error?: string })?.error });
      parts.push({ functionResponse: { id: fc.id, name: fc.name, response: { result: out } } });
    }
    contents.push({ role: "user", parts });
  }
  return { reply: "I could not finish the analysis in the allowed steps. Please ask a narrower question.", proposals, steps, model, history: contents };
}

export { notificationsFor };
