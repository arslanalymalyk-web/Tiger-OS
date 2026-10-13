-- ServiceTrace core schema (Milestone 1).
create extension if not exists pgcrypto;
-- Tenant = a maintenance contractor company. Customers are rows inside a tenant.
-- Isolation: every tenant table has company_id and a row-level-security policy keyed on
-- the per-transaction setting app.company_id. Application code ALSO filters by company_id.
-- The runtime connects as a non-owner role (trace_app) so RLS cannot be bypassed by the app.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'trace_app') then
    create role trace_app nologin;
  end if;
end $$;

create or replace function app_company() returns uuid language sql stable
  as $$ select nullif(current_setting('app.company_id', true), '')::uuid $$;
create or replace function app_user() returns uuid language sql stable
  as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
create or replace function app_is_platform() returns boolean language sql stable
  as $$ select coalesce(current_setting('app.platform', true), '') = '1' $$;

create or replace function forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;

-- ───────────────────────── companies & users ─────────────────────────
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  status text not null default 'active' check (status in ('active','suspended')),
  default_locale text not null default 'en' check (default_locale in ('en','ar')),
  case_counter bigint not null default 0,
  created_at timestamptz not null
);

create table users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  email text not null,
  name text not null check (length(name) between 1 and 200),
  role text not null check (role in ('platform_admin','company_admin','operations_manager','engineer','field_technician','customer_approver','auditor')),
  customer_id uuid,
  password_hash text,
  status text not null default 'invited' check (status in ('invited','active','deactivated')),
  locale text not null default 'en' check (locale in ('en','ar')),
  mfa_enabled boolean not null default false,
  mfa_secret_enc text,
  failed_logins int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null,
  deactivated_at timestamptz,
  check ((role = 'platform_admin') = (company_id is null)),
  check ((role = 'customer_approver') = (customer_id is not null))
);
create unique index users_email_uq on users (lower(email));

create table user_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  kind text not null check (kind in ('invite','reset')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  company_id uuid references companies(id),
  token_hash text not null unique,
  created_at timestamptz not null,
  last_seen_at timestamptz not null,
  expires_at timestamptz not null,
  idle_expires_at timestamptz not null,
  mfa_verified boolean not null default false,
  ip text,
  user_agent text,
  revoked_at timestamptz
);
create index sessions_user_idx on sessions (user_id);

create table auth_attempts (
  id bigserial primary key,
  key text not null,
  at timestamptz not null
);
create index auth_attempts_key_idx on auth_attempts (key, at);

-- ───────────────────────── master data ─────────────────────────
create table customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null check (length(name) between 1 and 200),
  contact_email text,
  created_at timestamptz not null
);
alter table users add constraint users_customer_fk foreign key (customer_id) references customers(id);

create table contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  customer_id uuid not null references customers(id),
  reference text not null,
  name text not null,
  starts_on date,
  ends_on date,
  created_at timestamptz not null,
  unique (company_id, reference)
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  customer_id uuid not null references customers(id),
  contract_id uuid references contracts(id),
  name text not null,
  address text,
  created_at timestamptz not null
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  site_id uuid not null references sites(id),
  parent_id uuid references assets(id),
  tag text not null,
  name text not null,
  asset_type text not null,
  discipline text not null default 'mep' check (discipline in ('fire_protection','mep')),
  make text, model text, serial_number text,
  installed_on date, warranty_until date,
  criticality text not null default 'medium' check (criticality in ('low','medium','high','critical')),
  qr_token text not null default encode(gen_random_bytes(12),'hex'),
  created_at timestamptz not null,
  unique (company_id, tag)
);

-- Restrict a user to specific sites or contracts. A user with any grant of a kind is
-- limited to those; a user with none of that kind is not limited by it.
create table user_access (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  user_id uuid not null references users(id),
  kind text not null check (kind in ('site','contract')),
  ref_id uuid not null,
  unique (user_id, kind, ref_id)
);

create table sla_policies (
  company_id uuid not null references companies(id),
  priority text not null check (priority in ('low','medium','high','urgent')),
  response_minutes int not null check (response_minutes > 0),
  resolution_minutes int not null check (resolution_minutes > 0),
  primary key (company_id, priority)
);

-- ───────────────────────── work orders / cases ─────────────────────────
create table cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  number bigint not null,
  type text not null check (type in ('corrective','preventive','inspection')),
  title text not null check (length(title) between 1 and 300),
  description text,
  site_id uuid not null references sites(id),
  asset_id uuid references assets(id),
  contract_id uuid references contracts(id),
  customer_id uuid not null references customers(id),
  priority text not null check (priority in ('low','medium','high','urgent')),
  status text not null check (status in ('new','assigned','in_progress','pending_review','info_requested','awaiting_customer','customer_query','approved','rejected','deferred','work_completed','closed')),
  created_by uuid not null references users(id),
  assigned_to uuid references users(id),
  reviewed_by uuid references users(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  response_due_at timestamptz not null,
  resolution_due_at timestamptz not null,
  first_response_at timestamptz,
  submitted_at timestamptz,
  work_completed_at timestamptz,
  closed_at timestamptz,
  deferred_until date,
  shared_with_customer_at timestamptz,
  unique (company_id, number)
);
create index cases_company_status_idx on cases (company_id, status);
create index cases_assigned_idx on cases (company_id, assigned_to);

-- Append-only timeline of every workflow step: who, what, when, from/to status.
create table case_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  case_id uuid not null references cases(id),
  actor_id uuid references users(id),
  kind text not null,
  from_status text,
  to_status text,
  detail jsonb not null default '{}',
  at timestamptz not null
);
create index case_events_case_idx on case_events (case_id, at);

-- Notes. observed_at = time the author says it was observed (device clock);
-- created_at = server receipt time. Both are kept; neither is editable.
create table case_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  case_id uuid not null references cases(id),
  author_id uuid not null references users(id),
  kind text not null check (kind in ('observation','review','comment','customer_message','completion')),
  visibility text not null default 'internal' check (visibility in ('internal','customer')),
  body text not null check (length(body) between 1 and 8000),
  observed_at timestamptz,
  created_at timestamptz not null
);
create index case_notes_case_idx on case_notes (case_id, created_at);

create table evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  case_id uuid not null references cases(id),
  asset_id uuid references assets(id),
  uploader_id uuid not null references users(id),
  original_name text not null,
  mime text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null,
  storage_key text not null unique,
  visibility text not null default 'internal' check (visibility in ('internal','customer')),
  caption text,
  captured_at timestamptz,
  uploaded_at timestamptz not null
);
create index evidence_case_idx on evidence (case_id);

-- ───────────────────────── approvals ─────────────────────────
create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  case_id uuid not null references cases(id),
  customer_id uuid not null references customers(id),
  requested_by uuid not null references users(id),
  summary text not null check (length(summary) between 1 and 4000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','info_requested','cancelled')),
  requested_at timestamptz not null,
  due_at timestamptz not null,
  decided_by uuid references users(id),
  decided_at timestamptz,
  decision_reason text
);
create unique index approval_one_open_per_case on approval_requests (case_id) where status in ('pending','info_requested');
create index approval_case_idx on approval_requests (case_id);

create table approval_reminders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  approval_id uuid not null references approval_requests(id),
  sent_by uuid references users(id),
  sent_at timestamptz not null,
  note text
);

create or replace function approval_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'approval_requests cannot be deleted' using errcode = '42501'; end if;
  if old.status in ('approved','rejected','cancelled') then
    raise exception 'a decided approval request is immutable' using errcode = '42501';
  end if;
  if new.requested_at <> old.requested_at or new.case_id <> old.case_id or new.requested_by <> old.requested_by then
    raise exception 'approval request origin is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger approval_guard_t before update or delete on approval_requests
  for each row execute function approval_guard();

-- ───────────────────────── notifications & audit ─────────────────────────
create table notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  user_id uuid not null references users(id),
  kind text not null,
  case_id uuid references cases(id),
  params jsonb not null default '{}',
  created_at timestamptz not null,
  read_at timestamptz
);
create index notifications_user_idx on notifications (user_id, created_at desc);

create table email_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  user_id uuid references users(id),
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null check (status in ('queued','sent','failed','not_configured')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null,
  sent_at timestamptz
);
create index email_outbox_company_idx on email_outbox (company_id, created_at desc);

-- Tamper-evident log: per-chain sequence + hash of (previous hash || canonical record).
create table audit_log (
  id bigserial primary key,
  chain text not null,
  company_id uuid references companies(id),
  seq bigint not null,
  at timestamptz not null,
  actor_id uuid,
  action text not null,
  entity_type text,
  entity_id text,
  detail jsonb not null default '{}',
  ip text,
  prev_hash text not null,
  hash text not null,
  unique (chain, seq)
);
create trigger audit_no_mutation before update or delete on audit_log
  for each row execute function forbid_mutation();
create trigger events_no_mutation before update or delete on case_events
  for each row execute function forbid_mutation();
create trigger notes_no_mutation before update or delete on case_notes
  for each row execute function forbid_mutation();
-- Evidence is immutable except for its sharing flag (changes are audited by the application).
create or replace function evidence_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'evidence cannot be deleted' using errcode = '42501'; end if;
  if (to_jsonb(new) - 'visibility') <> (to_jsonb(old) - 'visibility') then
    raise exception 'evidence content is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger evidence_guard_t before update or delete on evidence
  for each row execute function evidence_guard();
create trigger reminders_no_mutation before update or delete on approval_reminders
  for each row execute function forbid_mutation();

-- ───────────────────────── row-level security ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['customers','contracts','sites','assets','user_access','sla_policies','cases','case_events','case_notes','evidence','approval_requests','approval_reminders','notifications'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_isolation on %I using (company_id = app_company()) with check (company_id = app_company())', t);
  end loop;
end $$;

alter table users enable row level security;
create policy users_tenant on users
  using (company_id = app_company() or id = app_user())
  with check (company_id = app_company() or (company_id is null and app_is_platform()));

alter table companies enable row level security;
create policy companies_read on companies for select using (id = app_company() or app_is_platform());
create policy companies_insert on companies for insert with check (app_is_platform());
create policy companies_update on companies for update using (id = app_company() or app_is_platform());

alter table email_outbox enable row level security;
create policy outbox_tenant on email_outbox
  using (company_id = app_company() or (company_id is null and app_is_platform()))
  with check (company_id = app_company() or (company_id is null and app_is_platform()));

alter table audit_log enable row level security;
create policy audit_tenant on audit_log
  using (company_id = app_company() or (company_id is null and app_is_platform()))
  with check (company_id = app_company() or (company_id is null and app_is_platform()));

-- Login needs to find a user before the tenant is known: one narrow definer function.
create or replace function auth_find_user(p_email text) returns setof users
  language sql security definer set search_path = public as
  $$ select * from users where lower(email) = lower(p_email) limit 1 $$;
create or replace function auth_find_user_by_token(p_hash text, p_kind text)
  returns table (token_id uuid, user_id uuid, company_id uuid, expires_at timestamptz, used_at timestamptz)
  language sql security definer set search_path = public as
  $$ select t.id, t.user_id, u.company_id, t.expires_at, t.used_at
       from user_tokens t join users u on u.id = t.user_id
      where t.token_hash = p_hash and t.kind = p_kind $$;
revoke all on function auth_find_user(text), auth_find_user_by_token(text, text) from public;
grant execute on function auth_find_user(text), auth_find_user_by_token(text, text) to trace_app;

-- ───────────────────────── grants ─────────────────────────
grant usage on schema public to trace_app;
grant select, insert, update on companies, users, user_tokens, sessions, customers, contracts, sites, assets,
  sla_policies, cases, approval_requests, notifications, email_outbox to trace_app;
grant select, insert, delete on user_access to trace_app;
grant select, insert on auth_attempts, case_events, case_notes, evidence, approval_reminders, audit_log to trace_app;
grant update (visibility) on evidence to trace_app;
grant delete on auth_attempts to trace_app;
grant usage, select on all sequences in schema public to trace_app;
