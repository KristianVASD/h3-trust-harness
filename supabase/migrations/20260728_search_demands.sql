-- Worldwide Single Search demand log (anonymous + signed-in).
-- Service role only — no client policies.

create table if not exists public.search_demands (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  user_id uuid references auth.users (id) on delete set null,
  what text not null,
  location text not null,
  country text,
  parsed_sector text,
  matched_mission_id text,
  outcome text not null check (outcome in (
    'hit',
    'no_match',
    'empty_companies',
    'ambiguous',
    'quota_blocked'
  )),
  created_at timestamptz not null default now()
);

create index if not exists search_demands_created_idx
  on public.search_demands (created_at desc);

create index if not exists search_demands_place_idx
  on public.search_demands (location, country, what);

create index if not exists search_demands_outcome_idx
  on public.search_demands (outcome, created_at desc);

alter table public.search_demands enable row level security;
