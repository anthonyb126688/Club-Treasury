-- Reimbursement review (decided Nov 16).
--   * vendor / receipt_date / line_items / ai_summary are what the AI read.
--   * total_cents / category are what the member CONFIRMED (maybe edited);
--     ai_total_cents / ai_category keep what the AI originally read, so the
--     treasurer can compare the two.
--   * Nothing is auto-rejected: anything failing a rule is 'queued' with
--     every reason in review_reasons, filed under review_group.

alter table public.reimbursement_requests
  add column ai_total_cents    integer check (ai_total_cents >= 0),
  add column ai_category       text check (ai_category in ('food', 'travel', 'supplies', 'events', 'other')),
  add column member_edited     boolean not null default false,
  add column review_reasons    jsonb not null default '[]'::jsonb,
  add column review_group      text,
  add column duplicate_of      uuid references public.reimbursement_requests (id),
  -- Payout: same "claim, save signature, then send" pattern as dues.
  add column payout_claimed_at timestamptz,
  add column payout_error      text;

create index reimbursement_requests_created_idx on public.reimbursement_requests (created_at desc);

-- Monthly budgets (decided Nov 16). The treasurer can edit these later.
insert into public.category_budgets (category, monthly_limit_cents) values
  ('food',     20000),
  ('travel',   30000),
  ('supplies', 15000),
  ('events',   50000)
on conflict (category) do nothing;

-- Private bucket for receipt photos. No storage policies, so only our
-- server (secret key) can read or write; the treasurer sees photos through
-- short-lived links the server creates.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Whether the AI thought the photo was a receipt at all.
alter table public.reimbursement_requests
  add column ai_is_receipt boolean not null default true;
