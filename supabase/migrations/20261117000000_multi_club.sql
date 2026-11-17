-- Multi-club foundation (branch feature-multi-club, Nov 17).
-- ADDITIVE ONLY: the live app on main shares this database, so nothing is
-- renamed or dropped. New org_id columns default to the default club, so
-- main's inserts keep working until we merge. See
-- 20261117000001_multi_club_merge.sql for what to apply AT MERGE TIME.

-- The default club: today's single club, with its existing Squads vault.
-- Fixed id so the column defaults below can point at it.
-- (00000000-0000-4000-8000-000000000001)

create table public.orgs (
  id                            uuid primary key default gen_random_uuid(),
  name                          text not null check (length(name) between 1 and 80),
  school                        text not null default '' check (length(school) <= 80),
  join_code                     text not null unique check (join_code ~ '^[A-Z]{4}-[0-9]{4}$'),
  squads_multisig_address       text,
  squads_vault_address          text,
  squads_spending_limit_address text,
  vault_status                  text not null default 'pending'
                                check (vault_status in ('pending', 'ready', 'failed')),
  created_by                    text references public.members (privy_user_id),
  created_at                    timestamptz not null default now()
);
alter table public.orgs enable row level security;

create table public.org_memberships (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs (id) on delete cascade,
  privy_user_id  text not null references public.members (privy_user_id),
  role           text not null default 'member' check (role in ('member', 'treasurer')),
  status         text not null default 'pending'
                 check (status in ('pending', 'active', 'removed', 'declined')),
  requested_at   timestamptz not null default now(),
  approved_at    timestamptz,
  approved_by    text references public.members (privy_user_id),
  unique (org_id, privy_user_id)
);
create index org_memberships_user_idx on public.org_memberships (privy_user_id);
alter table public.org_memberships enable row level security;

create table public.org_settings (
  org_id                          uuid primary key references public.orgs (id) on delete cascade,
  dues_amount_cents               integer not null default 2500 check (dues_amount_cents > 0),
  dues_period                     text not null default 'semester' check (dues_period in ('semester', 'month')),
  auto_approve_cap_cents          integer not null default 5000 check (auto_approve_cap_cents >= 0),
  daily_auto_approve_limit_cents  integer not null default 15000 check (daily_auto_approve_limit_cents >= 0),
  max_receipt_age_days            integer not null default 60 check (max_receipt_age_days between 1 and 365),
  updated_at                      timestamptz not null default now()
);
alter table public.org_settings enable row level security;

-- Each club's own categories + budgets (replaces the fixed list).
-- slug is what reimbursement_requests.category stores.
create table public.org_categories (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  name          text not null check (length(name) between 1 and 40),
  slug          text not null check (slug ~ '^[a-z0-9-]{1,40}$'),
  budget_cents  integer not null default 0 check (budget_cents >= 0),
  period        text not null default 'month' check (period in ('month', 'semester')),
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (org_id, slug)
);
alter table public.org_categories enable row level security;

-- People: names for onboarding, and which club they last used.
alter table public.members
  add column first_name  text check (length(first_name) <= 40),
  add column last_name   text check (length(last_name) <= 40),
  add column last_org_id uuid references public.orgs (id);

-- ---- Default club + backfill -------------------------------------------------

insert into public.orgs (id, name, school, join_code, squads_multisig_address,
                         squads_vault_address, squads_spending_limit_address, vault_status, created_by)
select '00000000-0000-4000-8000-000000000001', 'Club Treasury Demo', '', 'CLUB-2026',
       'Bf3cdYw9JriUKFnpwfVACxiGTY4ZVQKVDJm5aPCR6wev',
       'DgiKYPQtyDopFvCrKjXSJFchQP8yag3yyvsPWmo4o225',
       'ezdxeG7gLCte2VaNFMWaLw5cWCSCGc7FgWn5PxCwEZR',
       'ready',
       (select privy_user_id from public.members where role = 'treasurer' limit 1);

insert into public.org_settings (org_id) values ('00000000-0000-4000-8000-000000000001');

insert into public.org_categories (org_id, name, slug, budget_cents, period)
select '00000000-0000-4000-8000-000000000001', initcap(b.category), b.category, b.monthly_limit_cents, 'month'
from public.category_budgets b;
insert into public.org_categories (org_id, name, slug, budget_cents, period)
values ('00000000-0000-4000-8000-000000000001', 'Other', 'other', 0, 'month')
on conflict (org_id, slug) do nothing;

insert into public.org_memberships (org_id, privy_user_id, role, status, approved_at)
select '00000000-0000-4000-8000-000000000001', privy_user_id, role, 'active', now()
from public.members;

-- ---- org_id on every club table (default = default club, for main) -----------

alter table public.dues_payments
  add column org_id uuid not null default '00000000-0000-4000-8000-000000000001'
  references public.orgs (id);
alter table public.reimbursement_requests
  add column org_id uuid not null default '00000000-0000-4000-8000-000000000001'
  references public.orgs (id);
alter table public.ledger_entries
  add column org_id uuid not null default '00000000-0000-4000-8000-000000000001'
  references public.orgs (id);

create index dues_payments_org_idx on public.dues_payments (org_id, period);
create index reimbursement_requests_org_idx on public.reimbursement_requests (org_id, status);
create index ledger_entries_org_idx on public.ledger_entries (org_id, created_at desc);

-- Dues: once per member per period PER CLUB. (The old per-member unique
-- stays until merge because main's code upserts on it.)
alter table public.dues_payments
  add constraint dues_payments_one_per_org_period unique (org_id, privy_user_id, period);

-- Categories are now per club, so drop the fixed list check (loosening only).
alter table public.reimbursement_requests
  drop constraint if exists reimbursement_requests_category_check,
  drop constraint if exists reimbursement_requests_ai_category_check;

-- Treasurer's note when denying a request (shown to the member).
alter table public.reimbursement_requests
  add column denial_note text check (length(denial_note) <= 500);

-- Vault setting changes the treasurer approves on-chain (new daily allowance,
-- add/remove a co-treasurer). The server prepares one; the treasurer's
-- account signs it; we only accept back exactly what we prepared.
create table public.org_vault_changes (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs (id) on delete cascade,
  kind             text not null check (kind in ('set_daily_limit', 'add_approver', 'remove_approver')),
  payload          jsonb not null,
  requested_by     text not null references public.members (privy_user_id),
  transaction_index bigint,
  approval_tx      text,
  approval_signature text unique,
  status           text not null default 'prepared' check (status in ('prepared', 'sent', 'done', 'failed')),
  created_at       timestamptz not null default now()
);
create index org_vault_changes_org_idx on public.org_vault_changes (org_id, created_at desc);
alter table public.org_vault_changes enable row level security;
