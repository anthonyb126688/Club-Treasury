-- Members of the club, one row per Privy login.
-- The welcome_* columns make the $50 signup payment happen exactly once:
-- a row is claimed ('pending') BEFORE anything is sent on-chain.
create table public.members (
  privy_user_id      text primary key,
  email              text,
  solana_address     text not null unique,
  welcome_status     text not null default 'pending'
                     check (welcome_status in ('pending', 'sent', 'failed')),
  welcome_signature  text,
  welcome_claimed_at timestamptz not null default now(),
  welcomed_at        timestamptz,
  created_at         timestamptz not null default now()
);

-- Row Level Security on, with no policies: browsers (anon/publishable key)
-- can't read or write this table. Only our server, using the secret key, can.
alter table public.members enable row level security;
