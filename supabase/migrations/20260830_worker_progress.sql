-- H3 worker progress: run status + engine event log.
-- Service role writes. No client write policies (same pattern as entities).

create table if not exists public.worker_runs (
  id uuid primary key default gen_random_uuid(),

  mission_id uuid,
  command text not null check (command in (
    'discover',
    'probe',
    'extract',
    'harvest',
    'coverage',
    'search',
    'full_mission'
  )),

  target_type text check (target_type in (
    'mission',
    'source',
    'company',
    'gap',
    'search'
  )),
  target_id text,

  status text not null default 'queued' check (status in (
    'queued',
    'running',
    'waiting_human',
    'succeeded',
    'failed',
    'cancelled'
  )),

  phase text,
  step_index integer not null default 0,
  step_total integer not null default 1,
  progress_pct integer not null default 0 check (progress_pct >= 0 and progress_pct <= 100),

  current_action text,
  input jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  cursor jsonb not null default '{}'::jsonb,

  error text,

  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists worker_runs_mission_idx
  on public.worker_runs (mission_id, created_at desc);

create index if not exists worker_runs_status_idx
  on public.worker_runs (status, created_at desc);

create table if not exists public.worker_events (
  id uuid primary key default gen_random_uuid(),

  run_id uuid not null references public.worker_runs(id) on delete cascade,
  mission_id uuid,

  level text not null default 'info' check (level in (
    'debug',
    'info',
    'warn',
    'error',
    'success'
  )),

  event_type text not null,
  step_name text,
  message text not null,

  data jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists worker_events_run_idx
  on public.worker_events (run_id, created_at asc);

create index if not exists worker_events_mission_idx
  on public.worker_events (mission_id, created_at desc);

alter table public.worker_runs enable row level security;
alter table public.worker_events enable row level security;

-- Intentionally no client write policies.
-- Server/worker uses SUPABASE_SERVICE_ROLE_KEY.
