-- Core tables for dues, reimbursements, budgets, and the public ledger.
-- Conventions:
--   * Money is stored in whole cents ($25.00 = 2500).
--   * Every table has Row Level Security on with NO policies, so browsers
--     can't read or write anything directly. Only our server (secret key) can.
--   * Undecided product rules (dues amount, budget numbers, treasurer
--     selection) are left flexible rather than guessed.

-- members: who's treasurer. Everyone starts as 'member'.
alter table public.members
  add column role text not null default 'member'
  check (role in ('member', 'treasurer'));

-- dues_payments: one row each time a member pays dues.
-- Same "record before sending" pattern as the welcome payment.
create table public.dues_payments (
  id             uuid primary key default gen_random_uuid(),
  privy_user_id  text not null references public.members (privy_user_id),
  amount_cents   integer not null check (amount_cents > 0),
  period         text,  -- e.g. '2026-fall'; per-term vs per-year still undecided
  status         text not null default 'pending'
                 check (status in ('pending', 'sent', 'failed')),
  signature      text unique,
  created_at     timestamptz not null default now(),
  paid_at        timestamptz
);
create index dues_payments_member_idx on public.dues_payments (privy_user_id);
alter table public.dues_payments enable row level security;

-- reimbursement_requests: one row per receipt submitted.
-- ai_summary and other AI-read fields are UNTRUSTED text: display as plain
-- text only. decision_reason is written by lib/policy/, never by the AI.
create table public.reimbursement_requests (
  id                  uuid primary key default gen_random_uuid(),
  privy_user_id       text not null references public.members (privy_user_id),

  -- the receipt
  receipt_path        text not null,   -- Supabase Storage path
  receipt_image_hash  text not null,   -- catches the exact same photo twice
  dedupe_key          text,            -- vendor|date|total: catches a new photo of the same receipt
  vendor              text,
  receipt_date        date,
  total_cents         integer check (total_cents >= 0),
  category            text check (category in ('food', 'travel', 'supplies', 'events', 'other')),
  line_items          jsonb not null default '[]'::jsonb,
  ai_summary          text,

  -- the decision (made by code in lib/policy/, never by the AI)
  status              text not null default 'submitted'
                      check (status in ('submitted', 'auto_approved', 'queued', 'approved',
                                        'rejected', 'paid', 'payment_failed')),
  decision_reason     text,
  decided_by          text,            -- 'policy' or the treasurer's privy_user_id
  decided_at          timestamptz,

  -- the payout
  payout_signature    text unique,
  paid_at             timestamptz,

  created_at          timestamptz not null default now()
);
create index reimbursement_requests_member_idx on public.reimbursement_requests (privy_user_id);
create index reimbursement_requests_image_hash_idx on public.reimbursement_requests (receipt_image_hash);
create index reimbursement_requests_dedupe_key_idx on public.reimbursement_requests (dedupe_key);
create index reimbursement_requests_status_idx on public.reimbursement_requests (status);
alter table public.reimbursement_requests enable row level security;

-- category_budgets: monthly limit per category. Spending is always computed
-- from reimbursement_requests, never stored here. Left empty: numbers TBD.
create table public.category_budgets (
  category             text primary key
                       check (category in ('food', 'travel', 'supplies', 'events', 'other')),
  monthly_limit_cents  integer not null check (monthly_limit_cents >= 0),
  updated_at           timestamptz not null default now()
);
alter table public.category_budgets enable row level security;

-- ledger_entries: the public record of club money in and out. A row is
-- added only AFTER the payment is confirmed on-chain; signature powers the
-- Verify link. Welcome payments are NOT club money and don't go here.
create table public.ledger_entries (
  id                        uuid primary key default gen_random_uuid(),
  direction                 text not null check (direction in ('in', 'out')),
  kind                      text not null check (kind in ('dues', 'reimbursement', 'deposit')),
  amount_cents              integer not null check (amount_cents > 0),
  description               text not null,
  privy_user_id             text references public.members (privy_user_id),
  dues_payment_id           uuid unique references public.dues_payments (id),
  reimbursement_request_id  uuid unique references public.reimbursement_requests (id),
  signature                 text not null unique,
  created_at                timestamptz not null default now(),

  constraint ledger_kind_matches check (
    (kind = 'dues'          and direction = 'in'  and dues_payment_id is not null
                            and reimbursement_request_id is null) or
    (kind = 'reimbursement' and direction = 'out' and reimbursement_request_id is not null
                            and dues_payment_id is null) or
    (kind = 'deposit'       and direction = 'in'  and dues_payment_id is null
                            and reimbursement_request_id is null)
  )
);
create index ledger_entries_created_idx on public.ledger_entries (created_at desc);
alter table public.ledger_entries enable row level security;
