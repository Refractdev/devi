-- Durable hosted operations: global pause, worker health, send reservations,
-- account-local day counters, notifications and operator access allowlist.
alter table public.workspaces add column if not exists stop_all boolean not null default false;

alter table public.email_accounts
  add column if not exists send_day date,
  add column if not exists sends_on_day integer not null default 0,
  add column if not exists send_window_started_at timestamptz,
  add column if not exists sends_in_window integer not null default 0,
  add column if not exists warmup_started_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists notification_only boolean not null default false;

create or replace function public.enforce_gmail_account_limit()
returns trigger language plpgsql set search_path = '' as $$
declare account_count integer;
begin
  if new.status='disconnected' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text, 1));
  select count(*) into account_count from public.email_accounts a
    where a.workspace_id=new.workspace_id and a.id<>new.id and a.status<>'disconnected';
  if account_count>=5 then raise exception 'A workspace can connect up to five Gmail accounts.' using errcode='23514'; end if;
  return new;
end $$;
drop trigger if exists gmail_account_limit on public.email_accounts;
create trigger gmail_account_limit before insert or update of status,workspace_id on public.email_accounts
for each row execute function public.enforce_gmail_account_limit();

alter table public.job_runs
  add column if not exists max_attempts integer not null default 5,
  add column if not exists locked_by text,
  add column if not exists locked_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists result jsonb not null default '{}'::jsonb;
create index if not exists idx_job_runs_claim on public.job_runs(state,run_after,lease_until);

alter table public.messages
  add column if not exists sequence_key text,
  add column if not exists error_code text,
  add column if not exists message_type text not null default 'outreach' check(message_type in ('outreach','reply','self_test'));
create unique index if not exists idx_messages_outbound_sequence_unique
  on public.messages(workspace_id,lead_id,sequence_key)
  where direction='outbound' and lead_id is not null and sequence_key is not null;

create table if not exists public.operator_access (
  email text primary key,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.operator_access enable row level security;
alter table public.operator_access force row level security;
revoke all on public.operator_access from public,anon,authenticated;

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  event_type text not null,
  ip_hash text,
  created_at timestamptz not null default now()
);
alter table public.security_events enable row level security;
alter table public.security_events force row level security;
revoke all on public.security_events from public,anon,authenticated;

create table if not exists public.auth_login_attempts (
  ip_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.auth_login_attempts enable row level security;
alter table public.auth_login_attempts force row level security;
revoke all on public.auth_login_attempts from public,anon,authenticated;
create or replace function public.allow_auth_attempt(target_ip_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  insert into public.auth_login_attempts(ip_hash,attempts) values(target_ip_hash,1)
  on conflict(ip_hash) do update set
    attempts=case when public.auth_login_attempts.window_started_at<now()-interval '15 minutes' then 1 else public.auth_login_attempts.attempts+1 end,
    window_started_at=case when public.auth_login_attempts.window_started_at<now()-interval '15 minutes' then now() else public.auth_login_attempts.window_started_at end,
    blocked_until=case when public.auth_login_attempts.window_started_at<now()-interval '15 minutes' then null when public.auth_login_attempts.attempts+1>10 then now()+interval '15 minutes' else public.auth_login_attempts.blocked_until end,
    updated_at=now();
  select blocked_until is null or blocked_until<=now() into allowed from public.auth_login_attempts where ip_hash=target_ip_hash;
  return allowed;
end $$;
revoke all on function public.allow_auth_attempt(text) from public,anon,authenticated;
grant execute on function public.allow_auth_attempt(text) to service_role;

create table if not exists public.worker_heartbeats (
  worker_id text primary key,
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  status text not null default 'starting' check(status in ('starting','healthy','degraded','stopping')),
  active_job_id uuid references public.job_runs(id) on delete set null,
  last_error_code text,
  metadata jsonb not null default '{}'::jsonb
);
alter table public.worker_heartbeats enable row level security;
alter table public.worker_heartbeats force row level security;
revoke all on public.worker_heartbeats from public,anon,authenticated;

create table if not exists public.ai_provider_health (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  status text not null default 'healthy' check(status in ('healthy','degraded')),
  first_failed_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  updated_at timestamptz not null default now()
);
alter table public.ai_provider_health enable row level security;
alter table public.ai_provider_health force row level security;
create policy workspace_member_all on public.ai_provider_health for all
  using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id));

create table if not exists public.notification_preferences (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  email text not null default 'lopesadilson948@gmail.com',
  notification_account_id uuid references public.email_accounts(id) on delete set null,
  quiet_start time not null default '23:00',
  quiet_end time not null default '07:00',
  timezone text not null default 'Africa/Luanda',
  daily_summary_at time not null default '21:00',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;
create policy workspace_member_all on public.notification_preferences for all
  using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_key text not null,
  event_type text not null,
  subject text not null,
  body text not null,
  href text,
  severity text not null default 'normal' check(severity in ('normal','critical')),
  event_count integer not null default 1,
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  status text not null default 'queued' check(status in ('queued','sending','sent','failed','cancelled')),
  attempt integer not null default 0,
  claimed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  unique(workspace_id,event_key)
);
create index if not exists idx_notifications_due on public.notifications(status,available_at);
alter table public.notifications enable row level security;
alter table public.notifications force row level security;
create policy workspace_member_all on public.notifications for all
  using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id));

create or replace function public.queue_operator_notification(
  target_workspace uuid,target_event_key text,target_type text,target_subject text,target_body text,
  target_href text,target_severity text,target_available timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare notification_id uuid;
begin
  insert into public.notifications(workspace_id,event_key,event_type,subject,body,href,severity,available_at)
  values(target_workspace,target_event_key,target_type,target_subject,target_body,target_href,target_severity,target_available)
  on conflict(workspace_id,event_key) do update set
    event_count=case when public.notifications.status='sent' then 1 else public.notifications.event_count+1 end,
    status=case when public.notifications.status='sent' then 'queued' else public.notifications.status end,
    sent_at=case when public.notifications.status='sent' then null else public.notifications.sent_at end,
    attempt=case when public.notifications.status='sent' then 0 else public.notifications.attempt end,
    claimed_at=null,body=excluded.body,subject=excluded.subject,
    available_at=case when public.notifications.status='sent' then excluded.available_at else least(public.notifications.available_at,excluded.available_at) end
  returning id into notification_id;
  return notification_id;
end $$;
revoke all on function public.queue_operator_notification(uuid,text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.queue_operator_notification(uuid,text,text,text,text,text,text,timestamptz) to service_role;

create or replace function public.claim_operator_notification()
returns setof public.notifications language sql security definer set search_path = '' as $$
  with candidate as (select id from public.notifications where (status='queued' and available_at<=now()) or (status='sending' and claimed_at<now()-interval '5 minutes') order by available_at,created_at for update skip locked limit 1)
  update public.notifications n set status='sending',attempt=attempt+1,claimed_at=now() from candidate where n.id=candidate.id returning n.*;
$$;
revoke all on function public.claim_operator_notification() from public,anon,authenticated;
grant execute on function public.claim_operator_notification() to service_role;

create or replace function public.reserve_outreach_send(target_message uuid,target_account uuid,target_rfc_id text,target_sequence_key text,target_cap integer,target_send_day date)
returns boolean language plpgsql security definer set search_path = '' as $$
declare reserved integer; counted integer; message_workspace uuid; target_email text; message_kind text;
begin
  select m.workspace_id,m.recipient,m.message_type into message_workspace,target_email,message_kind from public.messages m where m.id=target_message and m.direction='outbound' and m.send_state='queued' for update;
  if message_workspace is null then return false; end if;
  if exists(select 1 from public.workspaces w where w.id=message_workspace and w.stop_all)
     or exists(select 1 from public.suppression_entries s where s.workspace_id=message_workspace and s.normalized_email=lower(target_email)) then return false; end if;
  update public.messages m set send_state='sending',email_account_id=target_account,rfc_message_id=target_rfc_id,
    sequence_key=target_sequence_key,send_attempted_at=now()
  where m.id=target_message and m.direction='outbound' and m.send_state='queued'
    and not exists(select 1 from public.messages prior where prior.workspace_id=m.workspace_id and prior.lead_id=m.lead_id
      and prior.sequence_key=target_sequence_key and prior.id<>m.id and prior.send_state in ('sending','send_unknown','sent'));
  get diagnostics reserved=row_count;
  if reserved<>1 then return false; end if;
  if message_kind='self_test' then
    update public.email_accounts a set last_send_at=a.last_send_at
    where a.id=target_account and a.workspace_id=message_workspace and a.status='connected'
      and (a.paused_until is null or a.paused_until<=now());
    get diagnostics counted=row_count;
    if counted<>1 then
      update public.messages set send_state='queued',email_account_id=null,rfc_message_id=null,sequence_key=null,send_attempted_at=null where id=target_message;
      return false;
    end if;
  else
  update public.email_accounts a set send_day=target_send_day,
    sends_on_day=greatest(case when a.send_day=target_send_day then a.sends_on_day else 0 end,
      (select count(*)::integer from public.messages sent where sent.workspace_id=message_workspace and sent.email_account_id=target_account and sent.direction='outbound' and sent.message_type<>'self_test' and sent.send_state='sent' and sent.sent_at>=target_send_day::timestamptz and sent.sent_at<(target_send_day+1)::timestamptz))+1
    ,send_window_started_at=case when a.send_window_started_at is null or a.send_window_started_at<=now()-interval '24 hours' then now() else a.send_window_started_at end
    ,sends_in_window=case when a.send_window_started_at is null or a.send_window_started_at<=now()-interval '24 hours' then 1 else a.sends_in_window+1 end
  where a.id=target_account and a.workspace_id=message_workspace and a.status='connected'
    and (a.paused_until is null or a.paused_until<=now())
    and (case when a.send_window_started_at is null or a.send_window_started_at<=now()-interval '24 hours' then 0 else a.sends_in_window end)<target_cap
    and greatest(case when a.send_day=target_send_day then a.sends_on_day else 0 end,
      (select count(*)::integer from public.messages sent where sent.workspace_id=message_workspace and sent.email_account_id=target_account and sent.direction='outbound' and sent.message_type<>'self_test' and sent.send_state='sent' and sent.sent_at>=target_send_day::timestamptz and sent.sent_at<(target_send_day+1)::timestamptz))<target_cap;
  get diagnostics counted=row_count;
  if counted<>1 then
    update public.messages set send_state='queued',email_account_id=null,rfc_message_id=null,sequence_key=null,send_attempted_at=null where id=target_message;
    return false;
  end if;
  end if;
  return true;
end $$;
revoke all on function public.reserve_outreach_send(uuid,uuid,text,text,integer,date) from public,anon,authenticated;
grant execute on function public.reserve_outreach_send(uuid,uuid,text,text,integer,date) to service_role;

-- Claim exactly one due row atomically; the UPDATE lease protects overlapping workers.
create or replace function public.claim_outreach_job(target_job uuid,target_worker text)
returns setof public.job_runs language sql security definer set search_path = '' as $$
  update public.job_runs j set state='running',attempt=j.attempt+1,
    locked_by=target_worker,locked_at=now(),lease_until=now()+interval '3 minutes',updated_at=now()
  where j.id=target_job and ((j.state='queued' and j.run_after<=now()) or (j.state='running' and j.lease_until<now()))
  returning j.*;
$$;
revoke all on function public.claim_outreach_job(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_outreach_job(uuid,text) to service_role;

create or replace function public.worker_health_snapshot(target_workspace uuid)
returns jsonb language sql security definer set search_path = '' as $$
 select jsonb_build_object(
   'workers',coalesce((select jsonb_agg(to_jsonb(w)) from public.worker_heartbeats w),'[]'::jsonb),
   'queue',jsonb_build_object(
     'queued',(select count(*) from public.job_runs where workspace_id=target_workspace and state='queued'),
     'running',(select count(*) from public.job_runs where workspace_id=target_workspace and state='running'),
     'failed',(select count(*) from public.job_runs where workspace_id=target_workspace and state='failed')),
   'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'email',a.email,'status',a.status,'last_sync_at',a.last_sync_at,'last_error',a.last_error,'sent_today',a.sends_on_day)) from public.email_accounts a where a.workspace_id=target_workspace),'[]'::jsonb),
   'ai',(select jsonb_build_object('status',coalesce((select h.status from public.ai_provider_health h where h.workspace_id=target_workspace),'healthy'),'first_failed_at',(select h.first_failed_at from public.ai_provider_health h where h.workspace_id=target_workspace),'last_success_at',(select h.last_success_at from public.ai_provider_health h where h.workspace_id=target_workspace),'last_run',max(r.created_at)) from public.ai_runs r where r.workspace_id=target_workspace and r.created_at>now()-interval '1 hour')
 );
$$;
revoke all on function public.worker_health_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.worker_health_snapshot(uuid) to service_role;

-- Provision the single operator workspace atomically across concurrent OAuth callbacks.
create or replace function public.provision_operator_workspace(
  target_user uuid, target_email text, target_allowed jsonb, target_notification_email text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare existing_workspace uuid; new_workspace uuid; allowed_emails jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user::text, 0));
  select workspace_id into existing_workspace from public.workspace_members where user_id=target_user limit 1;
  if existing_workspace is not null then return existing_workspace; end if;
  insert into public.workspaces(name) values('Devrefract Workspace') returning id into new_workspace;
  insert into public.workspace_members(workspace_id,user_id,role) values(new_workspace,target_user,'owner');
  select coalesce(jsonb_agg(distinct lower(trim(item))), '[]'::jsonb) into allowed_emails
    from jsonb_array_elements_text(coalesce(target_allowed,'[]'::jsonb) || jsonb_build_array(lower(target_email))) as x(item);
  insert into public.workspace_settings(workspace_id,values) values(new_workspace,jsonb_build_object(
    'goal',5000,'goalCurrency','USD','goalDeadline','2026-12-06','senderName','Adilson',
    'senderCompany','Devrefract','senderAddress','','daily_cap_per_account',100,
    'allowedEmails',allowed_emails,'stopped','false'));
  insert into public.notification_preferences(workspace_id,email,timezone,quiet_start,quiet_end,daily_summary_at)
    values(new_workspace,coalesce(nullif(lower(trim(target_notification_email)),''),lower(target_email)),'Africa/Luanda','23:00','07:00','21:00');
  insert into public.operator_access(email,enabled)
    select value,true from jsonb_array_elements_text(allowed_emails) value
    on conflict(email) do update set enabled=true,updated_at=now();
  return new_workspace;
end $$;
revoke all on function public.provision_operator_workspace(uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.provision_operator_workspace(uuid,text,jsonb,text) to service_role;
