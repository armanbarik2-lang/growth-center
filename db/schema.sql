-- Growth Center schema (PostgreSQL / Supabase)
-- Every row carries ds = dataset id ('campusfest' = provided CampusFest 2025 data, 'gef' = simulated GEF Mumbai plan).

drop schema if exists ai cascade;
drop table if exists outreach_steps, enrollments, sequences, note_reads, notes, chat_actions, activations, tasks, deliverables, payments, deal_history, deals, activities,
  contacts, qualification_history, companies, campaigns, targets, members, datasets cascade;

create table datasets (
  id text primary key,
  name text not null,
  description text,
  simulated boolean not null default false,
  as_of timestamptz,            -- null = live (use now())
  outreach_start date,
  fest_start date,
  fest_end date,
  stages jsonb not null,        -- ordered [{key,label,kind}] kind: open | won | post | exit
  won_stage text not null,
  stage_prob jsonb,             -- probability of signing from each open stage
  prob_source text
);

create table members (
  id text primary key,
  ds text not null references datasets(id) on delete cascade,
  name text not null,
  role text not null check (role in ('head','member')),
  sector_group text,
  title text
);

create table campaigns (
  id text primary key,
  ds text not null references datasets(id) on delete cascade,
  name text not null,
  kind text not null default 'campaign',   -- campaign | bet | base
  channel text,
  objective text,
  audience text,
  owner_id text references members(id),
  start_at timestamptz,
  end_at timestamptz,
  budget numeric,
  spent numeric,
  rank int,
  pact jsonb,                 -- {p,a,c,t}
  target_deals numeric,
  target_value numeric,
  test text,
  kpi text,
  rule jsonb,                 -- scale/change/stop rule parameters
  pays_after_fest boolean default false,
  created_at timestamptz default now()
);

create table companies (
  id text primary key,
  ds text not null references datasets(id) on delete cascade,
  name text not null,
  industry text,
  sector_group text,
  owner_id text references members(id),
  campaign_id text references campaigns(id),
  qualification text,
  qualification_reason text,
  qualification_at timestamptz,
  created_at timestamptz default now()
);

create table qualification_history (
  id text primary key,
  ds text not null references datasets(id) on delete cascade,
  company_id text references companies(id) on delete cascade,
  campaign_id text references campaigns(id),
  status text,
  reason text,
  effective_at timestamptz
);

create table contacts (
  id text primary key,
  ds text not null references datasets(id) on delete cascade,
  company_id text references companies(id) on delete cascade,
  name text not null,
  title text,
  email text,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table activities (
  id text primary key,
  ds text not null references datasets(id) on delete cascade,
  company_id text references companies(id) on delete cascade,
  contact_id text references contacts(id),
  campaign_id text references campaigns(id),
  owner_id text references members(id),
  channel text,
  type text not null,        -- e.g. call, outreach_sent, delivered, replied, meeting_held, bounced
  outcome text,
  summary text,
  attempt_id text,
  qty int not null default 1, -- >1 for bulk email bursts
  occurred_at timestamptz not null default now()
);

create table deals (
  id text primary key,
  ds text not null references datasets(id) on delete cascade,
  name text not null,
  company_id text references companies(id) on delete cascade,
  contact_id text references contacts(id),
  campaign_id text references campaigns(id),
  owner_id text references members(id),
  support_type text not null default 'cash',   -- cash | in_kind
  stage text not null,
  furthest_idx int not null default 0,         -- furthest stage index ever reached (for funnel)
  proposed_value numeric default 0,
  confirmed_value numeric default 0,
  package text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  stage_changed_at timestamptz default now()
);

create table deal_history (
  id text primary key,
  ds text not null references datasets(id) on delete cascade,
  deal_id text references deals(id) on delete cascade,
  stage text,
  proposed_value numeric,
  confirmed_value numeric,
  owner_id text,
  changed_by text,
  effective_at timestamptz default now()
);

create table payments (
  id text primary key,
  ds text not null references datasets(id) on delete cascade,
  deal_id text references deals(id) on delete cascade,
  kind text not null,           -- advance | balance | full
  amount numeric not null,
  due_date date,
  paid_at timestamptz,
  status text not null default 'due',   -- due | paid | written_off
  note text
);

create table deliverables (
  id text primary key,
  ds text not null references datasets(id) on delete cascade,
  deal_id text references deals(id) on delete cascade,
  item text not null,
  status text not null default 'pending', -- pending | done
  due_date date,
  done_at timestamptz
);

create table tasks (
  id text primary key,
  ds text not null references datasets(id) on delete cascade,
  title text not null,
  details text,
  owner_id text references members(id),
  campaign_id text references campaigns(id) on delete set null,
  deal_id text references deals(id) on delete set null,
  company_id text references companies(id) on delete set null,
  due_date date,
  status text not null default 'todo',   -- todo | doing | done
  priority text not null default 'normal', -- high | normal | low
  source text not null default 'manual', -- manual | ai
  created_by text,
  created_at timestamptz default now(),
  done_at timestamptz
);

create table targets (
  id text primary key,
  ds text not null references datasets(id) on delete cascade,
  version text,
  effective_at timestamptz,
  qualified_goal numeric,
  deals_goal numeric,
  signed_value_goal numeric,
  before_fest_goal numeric,
  note text
);

create table activations (
  id text primary key,
  ds text not null references datasets(id) on delete cascade,
  deal_id text references deals(id) on delete cascade,
  company_id text references companies(id) on delete cascade,
  attendee_campaign text,
  note text,
  linked_at timestamptz
);

create table chat_actions (
  id bigserial primary key,
  ds text,
  member_id text,
  action text,
  payload jsonb,
  created_at timestamptz default now()
);

create table notes (
  id text primary key,
  ds text not null references datasets(id) on delete cascade,
  kind text not null default 'mom',       -- mom (meeting notes) | remark (special requirement) | update
  company_id text references companies(id) on delete cascade,
  deal_id text references deals(id) on delete cascade,
  author_id text references members(id),
  title text not null,
  detail text,                           -- full version, for the chosen heads
  brief text,                            -- short version, for all members
  meeting_at timestamptz,
  to_heads jsonb not null default '[]',  -- head ids, or ["*"] for all heads
  to_members boolean not null default false,
  created_at timestamptz default now()
);
create table note_reads (
  note_id text references notes(id) on delete cascade,
  member_id text,
  read_at timestamptz default now(),
  primary key (note_id, member_id)
);
create index on notes(ds, company_id);

-- email sequences: a template cadence, companies enrolled in it, and each step (email or call)
create table sequences (
  id text primary key,
  ds text not null references datasets(id) on delete cascade,
  name text not null,
  description text,
  steps jsonb not null,                 -- [{day, type: email|call, subject, body}]
  auto_start boolean not null default false,   -- start automatically when a proposal is mailed
  stop_on_reply boolean not null default true,
  switch_after_days int not null default 21,
  created_by text,
  created_at timestamptz default now()
);
create table enrollments (
  id text primary key,
  ds text not null references datasets(id) on delete cascade,
  sequence_id text references sequences(id) on delete cascade,
  deal_id text references deals(id) on delete cascade,
  company_id text references companies(id) on delete cascade,
  contact_id text references contacts(id),
  owner_id text references members(id),
  status text not null default 'active',  -- active | replied | switch_contact | stopped | completed
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  stop_reason text,
  reply_outcome text                       -- positive | neutral | not_interested
);
create table outreach_steps (
  id text primary key,
  ds text not null references datasets(id) on delete cascade,
  enrollment_id text references enrollments(id) on delete cascade,
  step_no int not null,
  day int not null,
  type text not null,                      -- email | call
  due_date date not null,
  status text not null default 'pending',  -- pending | sent | done | skipped
  subject text,
  body text,
  outcome text,
  done_at timestamptz
);
create index on enrollments(ds, status); create index on enrollments(ds, company_id); create index on outreach_steps(ds, enrollment_id);
create index on outreach_steps(ds, status, due_date);
create index on companies(ds); create index on contacts(ds, company_id); create index on activities(ds, company_id);
create index on activities(ds, campaign_id); create index on deals(ds, campaign_id); create index on deals(ds, stage);
create index on deal_history(ds, deal_id); create index on tasks(ds, owner_id); create index on payments(ds, deal_id);

-- Read-only views for the AI copilot: each view shows only the dataset set in app.ds
create schema ai;
-- app.member is empty for heads; for a member it is their id, and money/plan fields are hidden
create or replace function ai.is_head() returns boolean language sql stable as $$ select coalesce(current_setting('app.member', true), '') = '' $$;
create or replace function ai.me() returns text language sql stable as $$ select coalesce(current_setting('app.member', true), '') $$;
create view ai.dataset as select id,name,simulated,as_of,outreach_start,fest_start,fest_end,stages,won_stage,stage_prob from datasets where id = current_setting('app.ds', true);
create view ai.members as select id, name, role, sector_group, title from members where ds = current_setting('app.ds', true);
create view ai.campaigns as select id,name,kind,channel,objective,audience,owner_id,start_at,end_at,
  case when ai.is_head() then budget end budget, case when ai.is_head() then spent end spent, rank, pact,
  case when ai.is_head() then target_deals end target_deals, case when ai.is_head() then target_value end target_value,
  test, kpi, rule, pays_after_fest from campaigns where ds = current_setting('app.ds', true);
create view ai.companies as select * from companies where ds = current_setting('app.ds', true);
create view ai.qualification_history as select * from qualification_history where ds = current_setting('app.ds', true);
create view ai.contacts as select * from contacts where ds = current_setting('app.ds', true);
create view ai.activities as select * from activities where ds = current_setting('app.ds', true);
create view ai.deals as select id,name,company_id,contact_id,campaign_id,owner_id,support_type,stage,furthest_idx,
  case when ai.is_head() or owner_id = ai.me() then proposed_value end proposed_value,
  case when ai.is_head() or owner_id = ai.me() then confirmed_value end confirmed_value,
  package, created_at, updated_at, stage_changed_at from deals where ds = current_setting('app.ds', true);
create view ai.deal_history as select h.* from deal_history h join deals d on d.id=h.deal_id
  where h.ds = current_setting('app.ds', true) and (ai.is_head() or d.owner_id = ai.me());
create view ai.payments as select p.* from payments p join deals d on d.id=p.deal_id
  where p.ds = current_setting('app.ds', true) and (ai.is_head() or d.owner_id = ai.me());
create view ai.deliverables as select x.* from deliverables x join deals d on d.id=x.deal_id
  where x.ds = current_setting('app.ds', true) and (ai.is_head() or d.owner_id = ai.me());
create view ai.tasks as select * from tasks where ds = current_setting('app.ds', true);
create view ai.targets as select * from targets where ds = current_setting('app.ds', true) and ai.is_head();
create view ai.activations as select * from activations where ds = current_setting('app.ds', true);
create view ai.sequences as select id,name,description,steps,auto_start,stop_on_reply,switch_after_days from sequences where ds = current_setting('app.ds', true);
create view ai.enrollments as select * from enrollments where ds = current_setting('app.ds', true);
create view ai.outreach_steps as select id,enrollment_id,step_no,day,type,due_date,status,subject,outcome,done_at from outreach_steps where ds = current_setting('app.ds', true);
create view ai.notes as select id,kind,company_id,deal_id,author_id,title,
  case when ai.is_head() or author_id = ai.me() or kind = 'remark' then detail end detail, brief, meeting_at, to_heads, to_members, created_at
  from notes where ds = current_setting('app.ds', true)
  and (ai.is_head() or kind = 'remark' or to_members or author_id = ai.me());
