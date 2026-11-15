-- Dues are $25, once per term (decided Nov 15).
-- One row per member per term; a failed attempt reuses the same row.
alter table public.dues_payments
  add constraint dues_payments_one_per_term unique (privy_user_id, period);

-- The prepared payment (already signed by the treasury as fee payer, waiting
-- for the member's approval), so a refresh mid-payment can resume it.
alter table public.dues_payments
  add column pending_tx text;

-- When the current attempt started; used to decide when a stuck attempt is
-- safe to retry.
alter table public.dues_payments
  add column claimed_at timestamptz not null default now();
