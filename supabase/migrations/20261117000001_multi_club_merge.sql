-- APPLY ONLY WHEN MERGING feature-multi-club INTO main (not before: main's
-- code depends on what this removes).
--   * org_id is always set explicitly now; drop the default-club defaults so
--     a missing org_id is an error instead of silently landing in the
--     default club.
--   * dues are unique per (org, member, period); drop the old per-member one.

alter table public.dues_payments alter column org_id drop default;
alter table public.reimbursement_requests alter column org_id drop default;
alter table public.ledger_entries alter column org_id drop default;

alter table public.dues_payments drop constraint if exists dues_payments_one_per_term;
