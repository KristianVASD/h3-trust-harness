-- Nation trust-landscape documents + nation_map engine command.

alter table public.worker_runs
  drop constraint if exists worker_runs_command_check;

alter table public.worker_runs
  add constraint worker_runs_command_check check (command in (
    'discover',
    'probe',
    'extract',
    'harvest',
    'coverage',
    'search',
    'full_mission',
    'nation_map'
  ));

alter table public.worker_runs
  drop constraint if exists worker_runs_target_type_check;

alter table public.worker_runs
  add constraint worker_runs_target_type_check check (target_type in (
    'mission',
    'source',
    'company',
    'gap',
    'search',
    'country'
  ));

create table if not exists public.nation_landscapes (
  country_slug text primary key,
  country text not null,
  status text not null default 'empty' check (status in ('empty', 'mapping', 'ready')),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.nation_landscapes enable row level security;

-- Service role writes. No client write policies.
