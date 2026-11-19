create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','operator')),
  created_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);

create or replace function public.is_workspace_member(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target and wm.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_workspace_owner(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target and wm.user_id = (select auth.uid()) and wm.role = 'owner'
  );
$$;

create table if not exists public.workspace_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  values jsonb not null default '{"goal":5000,"currency":"USD","deadline":"2026-12-06","sender_name":"Adilson","sender_company":"Devrefract","sender_address":"","daily_cap_per_account":100,"business_start":"09:00","business_end":"17:00","timezone":"America/New_York","modelWriting":"openai/gpt-oss-120b","modelDiagnosis":"openai/gpt-oss-20b","modelChat":"openai/gpt-oss-120b","modelReviewer":"openai/gpt-oss-20b","modelNvidia":""}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  website text,
  city text,
  state_code text,
  timezone text,
  niche text,
  source text not null default 'CSV',
  synthetic boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,id)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  full_name text,
  email text,
  normalized_email text,
  title text,
  phone text,
  created_at timestamptz not null default now(),
  unique (workspace_id,normalized_email)
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  status text not null default 'new',
  score smallint not null default 0 check (score between 0 and 100),
  score_reasons jsonb not null default '[]'::jsonb,
  next_action text,
  last_contact_at timestamptz,
  synthetic boolean not null default false,
  legacy_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,legacy_id)
);

create table if not exists public.research_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','needs_review')),
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  provider text,
  model text,
  created_at timestamptz not null default now()
);

create table if not exists public.evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  research_run_id uuid references public.research_runs(id) on delete set null,
  finding_type text not null check (finding_type in ('verified_issue','potential_improvement','unknown','positive_signal')),
  observation text not null,
  excerpt text,
  source_url text,
  observed_at timestamptz not null default now(),
  confidence numeric(4,3) not null default 0.5 check (confidence between 0 and 1),
  synthetic boolean not null default false
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  evidence_id uuid references public.evidence(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'identified' check (status in ('identified','qualified','rejected','converted')),
  confidence numeric(4,3) check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  tokens_ciphertext text,
  status text not null default 'connected',
  connected_at timestamptz not null default now(),
  paused_until timestamptz,
  last_sync_at timestamptz,
  history_cursor text,
  next_send_at timestamptz,
  last_send_at timestamptz,
  sent_today integer not null default 0 check (sent_today >= 0),
  daily_cap integer not null default 25 check (daily_cap between 0 and 100),
  last_error text,
  created_at timestamptz not null default now(),
  unique (workspace_id,email)
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  status text not null default 'draft',
  mode text not null default 'review' check (mode in ('review','auto')),
  audience jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  confirmed_at timestamptz,
  paused_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  email_account_id uuid references public.email_accounts(id) on delete set null,
  state text not null default 'imported',
  variant text check (variant in ('A','B')),
  sequence_step smallint not null default 0,
  first_sent_at timestamptz,
  last_sent_at timestamptz,
  next_action_at timestamptz,
  last_error text,
  idempotency_key text not null,
  synthetic boolean not null default false,
  created_at timestamptz not null default now(),
  unique (campaign_id,lead_id),
  unique (workspace_id,idempotency_key)
);

create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  email_account_id uuid references public.email_accounts(id) on delete cascade,
  provider_thread_id text not null,
  subject text,
  last_message_at timestamptz,
  classification text,
  needs_attention boolean not null default false,
  unique (email_account_id,provider_thread_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  thread_id uuid references public.email_threads(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  recipient_id uuid references public.campaign_recipients(id) on delete set null,
  email_account_id uuid references public.email_accounts(id) on delete set null,
  direction text not null check (direction in ('inbound','outbound')),
  send_state text check (send_state in ('draft','awaiting_approval','queued','sending','send_unknown','sent','failed')),
  provider_message_id text,
  rfc_message_id text,
  sender text,
  recipient text,
  subject text,
  body text,
  classification text,
  confidence numeric(4,3),
  synthetic boolean not null default false,
  send_attempted_at timestamptz,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  unique (email_account_id,provider_message_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  thread_id uuid references public.email_threads(id) on delete set null,
  kind text not null,
  title text not null,
  details text,
  due_at timestamptz,
  status text not null default 'open',
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  stage text not null default 'demo',
  amount_usd numeric(12,2),
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppression_entries (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  normalized_email text not null,
  reason text not null,
  source text not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id,normalized_email)
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null,
  summary text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_type text not null,
  provider text,
  model text,
  status text not null,
  duration_ms integer,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd numeric(12,8),
  error_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_type text not null,
  entity_id uuid,
  state text not null default 'queued',
  idempotency_key text not null,
  attempt integer not null default 0,
  run_after timestamptz not null default now(),
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,idempotency_key)
);

create table if not exists public.encrypted_secrets (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  secret_name text not null,
  ciphertext text not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id,secret_name)
);

create table if not exists public.oauth_states (
  state_hash text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reconnect_account_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.legacy_id_map (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null,
  legacy_id integer not null,
  entity_id uuid not null,
  primary key (workspace_id,entity_type,legacy_id),
  unique (entity_id)
);

create or replace function public.enforce_five_gmail_accounts()
returns trigger language plpgsql set search_path = '' as $$
declare connected_count integer;
begin
  if new.status = 'connected' then
    select count(*) into connected_count from public.email_accounts
      where workspace_id = new.workspace_id and status = 'connected' and id is distinct from new.id;
    if connected_count >= 5 then raise exception 'A workspace can connect up to five Gmail accounts.' using errcode = '23514'; end if;
  end if;
  return new;
end $$;
drop trigger if exists limit_workspace_gmail_accounts on public.email_accounts;
create trigger limit_workspace_gmail_accounts before insert or update of status,workspace_id on public.email_accounts
for each row execute function public.enforce_five_gmail_accounts();

create extension if not exists pgmq with schema pgmq;
do $$ begin
  if to_regclass('pgmq.q_outreach_jobs') is null then perform pgmq.create('outreach_jobs'); end if;
end $$;

create or replace function public.enqueue_outreach_job(
  target_workspace uuid, target_type text, target_entity uuid, target_payload jsonb,
  target_key text, target_run_after timestamptz default now()
) returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid; delay_seconds integer;
begin
  insert into public.job_runs(workspace_id,job_type,entity_id,state,idempotency_key,run_after)
    values(target_workspace,target_type,target_entity,'queued',target_key,target_run_after)
    on conflict(workspace_id,idempotency_key) do nothing returning id into new_id;
  if new_id is null then
    select id into new_id from public.job_runs where workspace_id=target_workspace and idempotency_key=target_key;
    return new_id;
  end if;
  delay_seconds := greatest(0,ceil(extract(epoch from (target_run_after - now())))::integer);
  perform pgmq.send('outreach_jobs',jsonb_build_object('job_id',new_id,'workspace_id',target_workspace,'job_type',target_type,'entity_id',target_entity,'payload',coalesce(target_payload,'{}'::jsonb)),delay_seconds);
  return new_id;
end $$;

create or replace function public.read_outreach_job()
returns table(queue_message_id bigint,message jsonb) language sql security definer set search_path = '' as $$
  select msg_id,message from pgmq.read('outreach_jobs',120,1)
$$;

create or replace function public.ack_outreach_job(target_message_id bigint)
returns boolean language sql security definer set search_path = '' as $$
  select pgmq.delete('outreach_jobs',target_message_id)
$$;

revoke all on schema pgmq from public, anon, authenticated;
grant usage on schema pgmq to service_role;
revoke all on function public.enqueue_outreach_job(uuid,text,uuid,jsonb,text,timestamptz) from public, anon, authenticated;
revoke all on function public.read_outreach_job() from public, anon, authenticated;
revoke all on function public.ack_outreach_job(bigint) from public, anon, authenticated;
grant execute on function public.enqueue_outreach_job(uuid,text,uuid,jsonb,text,timestamptz) to service_role;
grant execute on function public.read_outreach_job() to service_role;
grant execute on function public.ack_outreach_job(bigint) to service_role;

create index if not exists idx_leads_workspace_status on public.leads(workspace_id,status,created_at desc);
create index if not exists idx_leads_workspace_score on public.leads(workspace_id,score desc);
create index if not exists idx_research_runs_due on public.research_runs(workspace_id,status,created_at);
create index if not exists idx_evidence_company_time on public.evidence(workspace_id,company_id,observed_at desc);
create index if not exists idx_campaign_recipients_due on public.campaign_recipients(workspace_id,state,next_action_at);
create index if not exists idx_threads_inbox on public.email_threads(workspace_id,needs_attention,last_message_at desc);
create index if not exists idx_messages_thread_time on public.messages(thread_id,created_at);
create index if not exists idx_tasks_due on public.tasks(workspace_id,status,due_at);
create index if not exists idx_jobs_due on public.job_runs(state,run_after);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'workspaces','workspace_members','workspace_settings','companies','contacts','leads','research_runs','evidence',
    'opportunities','email_accounts','campaigns','campaign_recipients','email_threads','messages',
    'tasks','deals','suppression_entries','activity_events','ai_runs','job_runs','encrypted_secrets','oauth_states','legacy_id_map'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end $$;

create policy workspace_member_read on public.workspaces for select using (public.is_workspace_member(id));
create policy workspace_member_update on public.workspaces for update using (public.is_workspace_member(id)) with check (public.is_workspace_member(id));
create policy workspace_member_all on public.workspace_settings for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'companies','contacts','leads','research_runs','evidence','opportunities','email_accounts',
    'campaigns','campaign_recipients','email_threads','messages','tasks','deals','suppression_entries',
    'activity_events','ai_runs','job_runs','encrypted_secrets','oauth_states','legacy_id_map'
  ] loop
    execute format('create policy workspace_member_all on public.%I for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id))', table_name);
  end loop;
end $$;

create policy member_list_workspace on public.workspace_members for select using (user_id = (select auth.uid()));
create policy owner_manage_members on public.workspace_members for all using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));

-- Account tokens and encrypted credentials are server-only, even for workspace members.
revoke all on public.email_accounts, public.encrypted_secrets from anon, authenticated;
revoke all on public.oauth_states from anon, authenticated;
revoke all on function public.enqueue_outreach_job(uuid,text,uuid,jsonb,text,timestamptz) from public,anon,authenticated;
revoke all on function public.read_outreach_job() from public,anon,authenticated;
revoke all on function public.ack_outreach_job(bigint) from public,anon,authenticated;
grant execute on function public.enqueue_outreach_job(uuid,text,uuid,jsonb,text,timestamptz) to service_role;
grant execute on function public.read_outreach_job() to service_role;
grant execute on function public.ack_outreach_job(bigint) to service_role;
