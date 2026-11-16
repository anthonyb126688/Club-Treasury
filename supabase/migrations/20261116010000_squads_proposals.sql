-- Squads vault (branch feature-squads). Queued requests get a Squads
-- proposal; the treasurer approves + executes it with their own account.
--   squads_transaction_index: which proposal pays this request
--   approval_tx: the prepared "approve + pay" the treasurer's account signs
--                (payout_signature holds its signature, saved before sending)
alter table public.reimbursement_requests
  add column squads_transaction_index bigint,
  add column approval_tx text;
